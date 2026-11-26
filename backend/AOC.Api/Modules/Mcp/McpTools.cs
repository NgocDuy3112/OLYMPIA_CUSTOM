using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using ModelContextProtocol.Protocol;
using ModelContextProtocol.Server;
using AOC.Api.Http;
using AOC.Domain.Contracts;
using AOC.Api.Modules.Live;
using AOC.Api.Modules.Matches;
using AOC.Api.Modules.Questions;
using AOC.Api.Modules.Questions.Reads;
using AOC.Api.Modules.McpKeys;
using AOC.Api.Realtime;
using AOC.Api.Shared;
using AOC.Infrastructure.Audit;
using AOC.Infrastructure.Data;
using AOC.Infrastructure.Data.Entities;

namespace AOC.Api.Modules.Mcp;

public sealed partial class McpTools(
    AOCDbContext db,
    QuestionReadStore questions,
    QuestionsService questionWrites,
    AssemblePatchService assembly,
    MatchesService matches,
    MatchTransitionService transitions,
    LiveService liveService,
    MatchHubRegistry hub,
    AuditService audit,
    IHttpContextAccessor httpContextAccessor)
{
    private static readonly JsonSerializerOptions Options = JsonApi.Options;

    private sealed record McpCall(
        string Tool, Guid? TournamentId, Guid? MatchId, JsonElement? Filters);

    private sealed record McpToolPayload(object Data, int? Total = null);

    private HttpContext Http()
        => httpContextAccessor.HttpContext
           ?? throw new ToolError("UNAUTHORIZED", "Missing MCP authentication context");

    private McpActor Actor() => McpActorAccessor.Require(Http());

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

    private static JsonElement Filters<T>(T values) => JsonDefaults.Serialize(values);

    private static object AgentQuestion(QuestionBankEntity row) => new
    {
        id = row.Id,
        kind = row.Kind,
        questionText = row.QuestionText,
        status = row.Status,
        usable = row.Status == QuestionStatus.PUBLISHED,
        version = VersionOf(row.UpdatedAt),
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

    private sealed record ToolFailure(string Code, string Message, int? ConflictVersion);

    private static ToolFailure Classify(Exception error) => error switch
    {
        ToolConflictError conflict => new("CONFLICT", conflict.Message, conflict.CurrentVersion),
        StaleRevisionError stale => new("CONFLICT", stale.Message, stale.CurrentRevision),
        LiveConflictError live => new("CONFLICT", live.Message, live.CurrentVersion),
        ToolError tool => new(tool.Code, tool.Message, null),
        MatchError match => new(match.Code.ToString(), match.Message, null),
        QuestionError question => new(question.Code.ToString(), question.Message, null),
        McpKeyError key => new(key.Code.ToString(), key.Message, null),
        RuleError rule => new(rule.Code, rule.Message, null),
        ApiException api => new(CodeForStatus(api.Status), api.Message, null),
        _ => new("INTERNAL", "Tool execution failed", null)
    };

    private static string CodeForStatus(int status) => status switch
    {
        400 => "VALIDATION",
        401 => "UNAUTHORIZED",
        403 => "FORBIDDEN",
        404 => "NOT_FOUND",
        409 => "CONFLICT",
        429 => "RATE_LIMITED",
        503 => "UNAVAILABLE",
        _ => "INTERNAL"
    };

    private static CallToolResult TextConflict(int currentVersion) => new()
    {
        IsError = true,
        Content =
        [
            new TextContentBlock
            {
                Text = JsonSerializer.Serialize(new { error = "CONFLICT", currentVersion }, Options)
            }
        ]
    };

    private async Task<CallToolResult> RunAsync(McpCall call, Func<McpActor, Task<McpToolPayload>> body)
    {
        McpActor actor;
        try
        {
            actor = Actor();
        }
        catch (ToolError error)
        {
            return TextError(error.Code, error.Message);
        }

        McpToolPayload? payload = null;
        ToolFailure? failure = null;

        try
        {
            McpToolScope.RequireTool(actor, call.Tool);
            payload = await body(actor);
        }
        catch (Exception error)
        {
            failure = Classify(error);
        }

        var outcome = payload is not null
            ? McpToolOutcome.allowed
            : failure!.Code == "FORBIDDEN" ? McpToolOutcome.denied : McpToolOutcome.failed;

        await McpToolAudit.RecordAsync(audit, httpContextAccessor.HttpContext, actor.UserId,
            new McpToolCallAudit(actor.KeyId, call.Tool, outcome, call.TournamentId, call.MatchId,
                call.Filters, payload?.Total, failure?.Code));

        if (payload is not null) return Text(payload.Data);
        return failure!.ConflictVersion is { } currentVersion
            ? TextConflict(currentVersion)
            : TextError(failure.Code, failure.Message);
    }

    public Task<CallToolResult> ListQuestions(string tournamentId, string? kind = null,
        string? search = null, int limit = 20, int offset = 0)
        => RunAsync(
            new McpCall(McpToolNames.ListQuestions,
                Guid.TryParse(tournamentId, out var tid) ? tid : null, null,
                Filters(new { kind, search })),
            async actor =>
            {
                var parsedKind = ParseKind(kind);
                await RequireVisibleTournamentAsync(ParseTournamentId(tournamentId), actor);

                var page = await questions.ListForAgentAsync(parsedKind, search, new Page(limit, offset));

                return new McpToolPayload(new
                {
                    items = page.Items.Select(AgentQuestion).ToList(),
                    total = page.Total,
                    limit = page.Limit,
                    offset = page.Offset
                }, page.Total);
            });

    public Task<CallToolResult> GetQuestion(string questionId, string tournamentId)
        => RunAsync(
            new McpCall(McpToolNames.GetQuestion,
                Guid.TryParse(tournamentId, out var tid) ? tid : null, null,
                Filters(new { questionId })),
            async actor =>
            {
                await RequireVisibleTournamentAsync(ParseTournamentId(tournamentId), actor);

                var row = await questions.GetForAgentAsync(questionId);

                return new McpToolPayload(AgentQuestion(row));
            });

    public Task<CallToolResult> EligibleQuestions(string tournamentId, string? kind = null,
        string? search = null, int limit = 20, int offset = 0)
        => RunAsync(
            new McpCall(McpToolNames.EligibleQuestions,
                Guid.TryParse(tournamentId, out var tid) ? tid : null, null,
                Filters(new { kind, search })),
            async actor =>
            {
                var parsedKind = ParseKind(kind);
                await RequireVisibleTournamentAsync(ParseTournamentId(tournamentId), actor);

                List<QuestionKind>? kinds = parsedKind is { } pk ? [pk] : null;

                var page = await questions.ListForAssemblyAsync(kinds, null, search, new Page(limit, offset));

                return new McpToolPayload(new
                {
                    items = page.Items.Select(AgentQuestion).ToList(),
                    total = page.Total,
                    limit = page.Limit,
                    offset = page.Offset
                }, page.Total);
            });
}
