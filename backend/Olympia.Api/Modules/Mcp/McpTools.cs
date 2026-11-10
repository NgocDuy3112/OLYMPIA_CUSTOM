using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using ModelContextProtocol.Protocol;
using ModelContextProtocol.Server;
using Olympia.Api.Http;
using Olympia.Domain.Contracts;
using Olympia.Api.Modules.Questions;
using Olympia.Api.Modules.McpKeys;
using Olympia.Api.Modules.Tournaments;
using Olympia.Api.Shared;
using Olympia.Infrastructure.Audit;
using Olympia.Infrastructure.Data;
using Olympia.Infrastructure.Data.Entities;

namespace Olympia.Api.Modules.Mcp;

/// <summary>Port of mcp/result.ts + mcp/actor.ts + the three MCP tools.</summary>
public sealed class ToolError(string code, string message) : Exception(message)
{
    public string Code { get; } = code;
}

public sealed record McpActor(Guid KeyId, List<string> Scopes, Guid? UserId, string? Role);

public static class McpActorAccessor
{
    public const string ItemKey = "mcpActor";

    public static McpActor Require(HttpContext http)
        => http.Items.TryGetValue(ItemKey, out var value) && value is McpActor actor
            ? actor
            : throw new ToolError("UNAUTHORIZED", "Missing MCP authentication context");

    public static void RequireScope(McpActor actor, string scope)
    {
        if (!actor.Scopes.Contains(scope))
            throw new ToolError("FORBIDDEN", $"Missing scope: {scope}");
    }
}

/// <summary>Tool implementations — one instance per MCP call (built from the request DI scope).</summary>
public sealed class McpTools(
    QuestionsService questions,
    TournamentsService tournaments,
    OlympiaDbContext db,
    AuditService audit,
    IHttpContextAccessor httpContextAccessor)
{
    private static readonly JsonSerializerOptions Options = JsonApi.Options;

    private McpActor Actor()
    {
        var http = httpContextAccessor.HttpContext
            ?? throw new ToolError("UNAUTHORIZED", "Missing MCP authentication context");
        return McpActorAccessor.Require(http);
    }

    private static void AssertTournamentVisible(TournamentEntity tournament, string? role)
    {
        var user = new UserEntity { Role = ParseRole(role) };
        if (!TournamentAccess.CanView(tournament, user))
            throw new ToolError("NOT_FOUND", $"tournament {tournament.Id} not found");
    }

    private static UserRole ParseRole(string? role) => role switch
    {
        "ADMIN" => UserRole.ADMIN,
        "OPERATOR" => UserRole.OPERATOR,
        _ => UserRole.PLAYER
    };

    private static object AgentQuestion(QuestionBankEntity row) => new
    {
        id = row.Id,
        kind = row.Kind,
        questionText = row.QuestionText,
        status = row.Status,
        usable = row.Status == QuestionStatus.PUBLISHED,
        media = row.Media,
        timeLimit = row.TimeLimit,
        payload = row.Payload,
        createdAt = row.CreatedAt,
        updatedAt = row.UpdatedAt
    };

    private static CallToolResult Text(object data) => new()
    {
        Content = [new TextContentBlock { Text = JsonSerializer.Serialize(data, Options) }]
    };

    private static CallToolResult TextError(string code, string message) => new()
    {
        IsError = true,
        Content = [new TextContentBlock { Text = JsonSerializer.Serialize(new { error = code, message }, Options) }]
    };

    /// <summary>Shared runner: mirrors runTool() — errors become isError results with a JSON body.</summary>
    private CallToolResult Run(Func<object> fn, string toolName, Guid? tournamentId,
        Dictionary<string, object?>? filters = null)
    {
        try
        {
            var data = fn();
            return Text(data);
        }
        catch (Exception error) when (error is ToolError or QuestionError or McpKeyError)
        {
            var code = error switch
            {
                ToolError t => t.Code,
                QuestionError q => q.Code.ToString(),
                McpKeyError m => m.Code.ToString(),
                _ => "INTERNAL"
            };
            return TextError(code, error.Message);
        }
        catch (Exception)
        {
            return TextError("INTERNAL", "Tool execution failed");
        }
    }

    private Task AuditAsync(McpActor actor, string tool, Guid? tournamentId,
        Dictionary<string, object?>? filters, int? total)
    {
        var http = httpContextAccessor.HttpContext;
        var details = AuditService.McpAuditDetails(actor.KeyId, new Dictionary<string, object?>
        {
            ["tool"] = tool,
            ["tournamentId"] = tournamentId,
            ["filters"] = filters,
            ["total"] = total
        });
        return audit.AuditAsync(new AuditEvent
        {
            Action = "mcp_tool_call",
            ActorId = actor.UserId,
            Ip = http?.Connection.RemoteIpAddress?.ToString(),
            UserAgent = http?.Request.Headers.UserAgent.ToString(),
            Details = details
        });
    }

    // ---- list_questions -------------------------------------------------------------

    public CallToolResult ListQuestions(string tournamentId, string? kind = null,
        string? search = null, int limit = 20, int offset = 0)
    {
        var actor = Actor();
        return Run(() =>
        {
            McpActorAccessor.RequireScope(actor, "READ");
            var tid = Guid.Parse(tournamentId);
            var tournament = db.Tournaments.AsNoTracking().First(t => t.Id == tid && t.DeletedAt == null);
            AssertTournamentVisible(tournament, actor.Role);

            QuestionKind? parsedKind = kind is null
                ? null
                : Enum.Parse<QuestionKind>(kind);

            var page = questions.ListForAgentAsync(parsedKind, search, new Page(limit, offset))
                .GetAwaiter().GetResult();

            AuditAsync(actor, "list_questions", tid,
                new Dictionary<string, object?> { ["kind"] = kind, ["search"] = search },
                page.Total).GetAwaiter().GetResult();

            return new
            {
                items = page.Items.Select(AgentQuestion).ToList(),
                total = page.Total,
                limit = page.Limit,
                offset = page.Offset
            };
        }, "list_questions", Guid.Parse(tournamentId),
            new Dictionary<string, object?> { ["kind"] = kind, ["search"] = search });
    }

    // ---- get_question -----------------------------------------------------------------

    public CallToolResult GetQuestion(string questionId, string tournamentId)
    {
        var actor = Actor();
        return Run(() =>
        {
            McpActorAccessor.RequireScope(actor, "READ");
            var tid = Guid.Parse(tournamentId);
            var tournament = db.Tournaments.AsNoTracking().First(t => t.Id == tid && t.DeletedAt == null);
            AssertTournamentVisible(tournament, actor.Role);

            var row = questions.GetForAgentAsync(questionId).GetAwaiter().GetResult();

            AuditAsync(actor, "get_question", tid,
                new Dictionary<string, object?> { ["questionId"] = questionId, ["status"] = row.Status.ToString() },
                null).GetAwaiter().GetResult();

            return AgentQuestion(row);
        }, "get_question", Guid.Parse(tournamentId), null);
    }

    // ---- eligible_questions ------------------------------------------------------------

    public CallToolResult EligibleQuestions(string tournamentId, string? kind = null,
        string? search = null, int limit = 20, int offset = 0)
    {
        var actor = Actor();
        return Run(() =>
        {
            McpActorAccessor.RequireScope(actor, "READ");
            var tid = Guid.Parse(tournamentId);
            var tournament = db.Tournaments.AsNoTracking().First(t => t.Id == tid && t.DeletedAt == null);
            AssertTournamentVisible(tournament, actor.Role);

            List<QuestionKind>? kinds = kind is null ? null : [Enum.Parse<QuestionKind>(kind)];

            var page = questions.ListForAssemblyAsync(kinds, null, search, new Page(limit, offset))
                .GetAwaiter().GetResult();

            AuditAsync(actor, "eligible_questions", tid,
                new Dictionary<string, object?> { ["kind"] = kind, ["search"] = search },
                page.Total).GetAwaiter().GetResult();

            return new
            {
                items = page.Items.Select(AgentQuestion).ToList(),
                total = page.Total,
                limit = page.Limit,
                offset = page.Offset
            };
        }, "eligible_questions", Guid.Parse(tournamentId),
            new Dictionary<string, object?> { ["kind"] = kind, ["search"] = search });
    }
}
