using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using ModelContextProtocol.Protocol;
using ModelContextProtocol.Server;
using AOC.Api.Http;
using AOC.Domain.Contracts;
using AOC.Api.Modules.Questions;
using AOC.Api.Modules.Questions.Reads;
using AOC.Api.Modules.McpKeys;
using AOC.Api.Modules.Tournaments;
using AOC.Api.Shared;
using AOC.Infrastructure.Audit;
using AOC.Infrastructure.Data;
using AOC.Infrastructure.Data.Entities;

namespace AOC.Api.Modules.Mcp;

public sealed class McpTools(
    QuestionReadStore questions,
    TournamentsService tournaments,
    AOCDbContext db,
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

    private static Guid ParseTournamentId(string tournamentId)
    {
        if (!Guid.TryParse(tournamentId, out var id))
            throw ApiException.BadRequest("tournamentId: Expected string with format 'uuid'");
        return id;
    }

    private static QuestionKind? ParseKind(string? kind)
    {
        if (kind is null) return null;
        if (!Enum.TryParse<QuestionKind>(kind, out var parsed))
            throw ApiException.BadRequest("kind: Expected union value");
        return parsed;
    }

    private static object AgentQuestion(QuestionBankEntity row) => new
    {
        id = row.Id,
        kind = row.Kind,
        questionText = row.QuestionText,
        status = row.Status,
        usable = row.Status == QuestionStatus.PUBLISHED,
        media = row.Media,
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


    public CallToolResult ListQuestions(string tournamentId, string? kind = null,
        string? search = null, int limit = 20, int offset = 0)
    {
        var actor = Actor();
        var tid = ParseTournamentId(tournamentId);
        var parsedKind = ParseKind(kind);
        return Run(() =>
        {
            McpActorAccessor.RequireScope(actor, "READ");
            var tournament = db.Tournaments.AsNoTracking().First(t => t.Id == tid && t.DeletedAt == null);
            AssertTournamentVisible(tournament, actor.Role);

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
        }, "list_questions", tid,
            new Dictionary<string, object?> { ["kind"] = kind, ["search"] = search });
    }


    public CallToolResult GetQuestion(string questionId, string tournamentId)
    {
        var actor = Actor();
        var tid = ParseTournamentId(tournamentId);
        return Run(() =>
        {
            McpActorAccessor.RequireScope(actor, "READ");
            var tournament = db.Tournaments.AsNoTracking().First(t => t.Id == tid && t.DeletedAt == null);
            AssertTournamentVisible(tournament, actor.Role);

            var row = questions.GetForAgentAsync(questionId).GetAwaiter().GetResult();

            AuditAsync(actor, "get_question", tid,
                new Dictionary<string, object?> { ["questionId"] = questionId, ["status"] = row.Status.ToString() },
                null).GetAwaiter().GetResult();

            return AgentQuestion(row);
        }, "get_question", tid, null);
    }


    public CallToolResult EligibleQuestions(string tournamentId, string? kind = null,
        string? search = null, int limit = 20, int offset = 0)
    {
        var actor = Actor();
        var tid = ParseTournamentId(tournamentId);
        var parsedKind = ParseKind(kind);
        return Run(() =>
        {
            McpActorAccessor.RequireScope(actor, "READ");
            var tournament = db.Tournaments.AsNoTracking().First(t => t.Id == tid && t.DeletedAt == null);
            AssertTournamentVisible(tournament, actor.Role);

            List<QuestionKind>? kinds = parsedKind is { } pk ? [pk] : null;

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
        }, "eligible_questions", tid,
            new Dictionary<string, object?> { ["kind"] = kind, ["search"] = search });
    }
}
