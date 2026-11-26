using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using ModelContextProtocol.Protocol;
using ModelContextProtocol.Server;
using AOC.Api.Http;
using AOC.Domain.Contracts;
using AOC.Api.Modules.Questions;
using AOC.Api.Modules.Questions.Reads;
using AOC.Api.Modules.McpKeys;
using AOC.Api.Shared;
using AOC.Infrastructure.Audit;
using AOC.Infrastructure.Data;
using AOC.Infrastructure.Data.Entities;

namespace AOC.Api.Modules.Mcp;

public sealed class McpTools(
    QuestionReadStore questions,
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

    private async Task<UserEntity> ActorUserAsync(McpActor actor)
    {
        if (actor.UserId is not { } userId)
            throw new ToolError("UNAUTHORIZED", "MCP key has no owning account");
        return await db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == userId)
               ?? throw new ToolError("UNAUTHORIZED", "MCP key owner account not found");
    }

    private static void AssertTournamentVisible(TournamentEntity tournament, UserEntity user)
    {
        if (!TournamentAccess.CanView(tournament, user))
            throw new ToolError("NOT_FOUND", $"tournament {tournament.Id} not found");
    }

    private async Task<TournamentEntity> RequireVisibleTournamentAsync(Guid tournamentId, McpActor actor)
    {
        var tournament = await db.Tournaments.AsNoTracking()
                             .FirstOrDefaultAsync(t => t.Id == tournamentId && t.DeletedAt == null)
                         ?? throw new ToolError("NOT_FOUND", $"tournament {tournamentId} not found");
        AssertTournamentVisible(tournament, await ActorUserAsync(actor));
        return tournament;
    }

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

    private static async Task<CallToolResult> Run(Func<Task<object>> fn)
    {
        try
        {
            return Text(await fn());
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


    public async Task<CallToolResult> ListQuestions(string tournamentId, string? kind = null,
        string? search = null, int limit = 20, int offset = 0)
    {
        var actor = Actor();
        var tid = ParseTournamentId(tournamentId);
        var parsedKind = ParseKind(kind);
        return await Run(async () =>
        {
            McpToolScope.RequireTool(actor, McpToolNames.ListQuestions);
            await RequireVisibleTournamentAsync(tid, actor);

            var page = await questions.ListForAgentAsync(parsedKind, search, new Page(limit, offset));

            await AuditAsync(actor, McpToolNames.ListQuestions, tid,
                new Dictionary<string, object?> { ["kind"] = kind, ["search"] = search },
                page.Total);

            return new
            {
                items = page.Items.Select(AgentQuestion).ToList(),
                total = page.Total,
                limit = page.Limit,
                offset = page.Offset
            };
        });
    }


    public async Task<CallToolResult> GetQuestion(string questionId, string tournamentId)
    {
        var actor = Actor();
        var tid = ParseTournamentId(tournamentId);
        return await Run(async () =>
        {
            McpToolScope.RequireTool(actor, McpToolNames.GetQuestion);
            await RequireVisibleTournamentAsync(tid, actor);

            var row = await questions.GetForAgentAsync(questionId);

            await AuditAsync(actor, McpToolNames.GetQuestion, tid,
                new Dictionary<string, object?> { ["questionId"] = questionId, ["status"] = row.Status.ToString() },
                null);

            return AgentQuestion(row);
        });
    }


    public async Task<CallToolResult> EligibleQuestions(string tournamentId, string? kind = null,
        string? search = null, int limit = 20, int offset = 0)
    {
        var actor = Actor();
        var tid = ParseTournamentId(tournamentId);
        var parsedKind = ParseKind(kind);
        return await Run(async () =>
        {
            McpToolScope.RequireTool(actor, McpToolNames.EligibleQuestions);
            await RequireVisibleTournamentAsync(tid, actor);

            List<QuestionKind>? kinds = parsedKind is { } pk ? [pk] : null;

            var page = await questions.ListForAssemblyAsync(kinds, null, search, new Page(limit, offset));

            await AuditAsync(actor, McpToolNames.EligibleQuestions, tid,
                new Dictionary<string, object?> { ["kind"] = kind, ["search"] = search },
                page.Total);

            return new
            {
                items = page.Items.Select(AgentQuestion).ToList(),
                total = page.Total,
                limit = page.Limit,
                offset = page.Offset
            };
        });
    }
}
