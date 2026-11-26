using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using AOC.Api.Http;
using ModelContextProtocol.Protocol;
using AOC.Api.Modules.Live;
using AOC.Api.Modules.Matches;
using AOC.Api.Modules.Questions;
using AOC.Api.Shared;
using AOC.Domain.Contracts;
using AOC.Infrastructure.Configuration;
using AOC.Infrastructure.Data;
using AOC.Infrastructure.Data.Entities;

namespace AOC.Api.Modules.Mcp;

public sealed partial class McpTools
{
    private static int VersionOf(DateTime updatedAt) => (int)(updatedAt - DateTime.UnixEpoch).TotalMilliseconds;

    private static Guid ParseQuestionId(string questionId)
        => Guid.TryParse(questionId, out var id)
            ? id
            : throw new ToolError("VALIDATION", "questionId: Expected string with format 'uuid'");

    private static Guid ParseMatchId(string matchId)
        => Guid.TryParse(matchId, out var id)
            ? id
            : throw new ToolError("VALIDATION", "matchId: Expected string with format 'uuid'");

    private static Guid ActorIdOf(McpActor actor)
        => actor.UserId ?? throw new ToolError("UNAUTHORIZED", "MCP key has no owning account");

    private async Task<TournamentEntity> RequireWritableTournamentAsync(Guid tournamentId, McpActor actor)
    {
        var tournament = await RequireVisibleTournamentAsync(tournamentId, actor);
        if (!TournamentAccess.CanWrite(tournament, await ActorUserAsync(actor)))
            throw new ToolError("FORBIDDEN", "Only the owner or an admin may write to this tournament");
        return tournament;
    }

    private async Task<MatchesService.MatchScope> RequireWritableMatchAsync(
        Guid tournamentId, Guid matchId, McpActor actor)
    {
        var scope = await matches.RequireMatchScopeAsync(tournamentId.ToString(), matchId.ToString());
        var user = await ActorUserAsync(actor);
        if (!TournamentAccess.CanView(scope.Tournament, user))
            throw new ToolError("NOT_FOUND", $"tournament {tournamentId} not found");
        if (!TournamentAccess.CanWrite(scope.Tournament, user))
            throw new ToolError("FORBIDDEN", "Only the owner or an admin may write to this tournament");
        return scope;
    }

    public Task<CallToolResult> CreateQuestion(string tournamentId, string kind, string questionText,
        JsonElement payload, string? keywordId = null, List<string>? tags = null, bool dryRun = false)
        => RunAsync(
            new McpCall(McpToolNames.CreateQuestion,
                Guid.TryParse(tournamentId, out var tid) ? tid : null, null,
                Filters(new { kind, keywordId })),
            async actor =>
            {
                await RequireWritableTournamentAsync(ParseTournamentId(tournamentId), actor);
                if (!Enum.TryParse<QuestionKind>(kind, out var parsedKind))
                    throw new ToolError("VALIDATION", "kind: Expected union value");

                var input = new QuestionsService.CreateQuestionDto(
                    parsedKind, questionText, keywordId, payload.Clone(), null, tags);
                var row = await questionWrites.CreateQuestionAsync(
                    new QuestionsService.WriteContext(ActorIdOf(actor)), input, dryRun);

                return new McpToolPayload(dryRun
                    ? new { dryRun, wouldCreate = AgentQuestion(row) }
                    : (object)new { question = AgentQuestion(row), version = VersionOf(row.UpdatedAt) });
            });

    public Task<CallToolResult> UpdateQuestion(string tournamentId, string questionId, int expectedVersion,
        JsonElement patch, bool dryRun = false)
        => RunAsync(
            new McpCall(McpToolNames.UpdateQuestion,
                Guid.TryParse(tournamentId, out var tid) ? tid : null, null,
                Filters(new { questionId, expectedVersion })),
            async actor =>
            {
                await RequireWritableTournamentAsync(ParseTournamentId(tournamentId), actor);
                var questionGuid = ParseQuestionId(questionId);

                await using var transaction = await db.Database.BeginTransactionAsync();
                var current = VersionOf(await questions.RequireLockedUpdatedAtAsync(questionGuid));
                if (current != expectedVersion)
                    throw new ToolConflictError(current);

                var row = await questionWrites.UpdateQuestionAsync(questionId, patch);
                if (dryRun)
                {
                    await transaction.RollbackAsync();
                    db.ChangeTracker.Clear();
                    return new McpToolPayload(new
                    {
                        dryRun,
                        questionId,
                        version = VersionOf(row.UpdatedAt),
                        wouldSet = patch
                    });
                }

                await transaction.CommitAsync();
                return new McpToolPayload(new
                {
                    question = AgentQuestion(row),
                    version = VersionOf(row.UpdatedAt)
                });
            });

    public Task<CallToolResult> AssembleMatch(string tournamentId, string matchId, int baseRevision,
        JsonElement questions, bool dryRun = false)
        => RunAsync(
            new McpCall(McpToolNames.AssembleMatch,
                Guid.TryParse(tournamentId, out var tid) ? tid : null,
                Guid.TryParse(matchId, out var mid) ? mid : null,
                Filters(new { baseRevision })),
            async actor =>
            {
                await RequireWritableMatchAsync(
                    ParseTournamentId(tournamentId), ParseMatchId(matchId), actor);

                var input = new MatchSchemas.PatchAssembleInput(
                    baseRevision, MatchSchemas.ParseAssemblyEntries(questions));
                var result = await assembly.PatchAssembleAsync(
                    tournamentId, matchId, input, ActorIdOf(actor), dryRun);

                if (!dryRun) await hub.PublishAsync(matchId);

                return new McpToolPayload(new
                {
                    dryRun,
                    assemblyRevision = result.AssemblyRevision,
                    added = result.Added,
                    removed = result.Removed
                });
            });

    public Task<CallToolResult> TransitionMatch(string tournamentId, string matchId, int expectedVersion,
        string status, bool dryRun = false)
        => RunAsync(
            new McpCall(McpToolNames.TransitionMatch,
                Guid.TryParse(tournamentId, out var tid) ? tid : null,
                Guid.TryParse(matchId, out var mid) ? mid : null,
                Filters(new { expectedVersion, status })),
            async actor =>
            {
                var scope = await RequireWritableMatchAsync(
                    ParseTournamentId(tournamentId), ParseMatchId(matchId), actor);
                var current = (int)scope.Match.Status;
                if (current != expectedVersion)
                    throw new ToolConflictError(current);
                if (!Enum.TryParse<MatchStatus>(status, out var next))
                    throw new ToolError("VALIDATION", "status: Expected one of UPCOMING, LIVE, FINISHED");

                if (dryRun)
                {
                    if (!MatchTransitionService.CanTransition(scope.Match.Status, next))
                        throw new ToolError("INVALID_TRANSITION",
                            $"cannot move a match from {scope.Match.Status} to {next}");
                    return new McpToolPayload(new { dryRun, from = scope.Match.Status, to = next });
                }

                var match = await transitions.TransitionMatchAsync(tournamentId, matchId, status);
                await MatchStatusChange.NotifyAsync(Http(), hub, audit, ActorIdOf(actor),
                    ParseTournamentId(tournamentId), matchId, scope.Match.Status, match);
                return new McpToolPayload(new { match.Status, version = (int)match.Status });
            });

    public Task<CallToolResult> LiveAction(string tournamentId, string matchId, int expectedVersion,
        JsonElement action, bool dryRun = false)
        => RunAsync(
            new McpCall(McpToolNames.LiveAction,
                Guid.TryParse(tournamentId, out var tid) ? tid : null,
                Guid.TryParse(matchId, out var mid) ? mid : null,
                Filters(new { expectedVersion })),
            async actor =>
            {
                var scope = await RequireWritableMatchAsync(
                    ParseTournamentId(tournamentId), ParseMatchId(matchId), actor);
                var actorId = ActorIdOf(actor);

                LiveAction parsed;
                try
                {
                    parsed = action.Deserialize<LiveAction>(JsonApi.Options)
                             ?? throw new ToolError("VALIDATION", "action: Expected object");
                }
                catch (JsonException)
                {
                    throw new ToolError("VALIDATION", "action: Expected object");
                }

                if (dryRun)
                {
                    var matchGuid = ParseMatchId(matchId);
                    var live = await db.MatchLive.AsNoTracking()
                                   .FirstOrDefaultAsync(l => l.MatchId == matchGuid)
                               ?? throw new ToolError("NOT_FOUND", $"match {matchId} has no live round");
                    LiveConflictError.AssertVersion(expectedVersion, live.Version);
                    return new McpToolPayload(new
                    {
                        dryRun,
                        kind = parsed.Kind,
                        roundId = live.RoundId,
                        fromVersion = live.Version,
                        toVersion = live.Version + 1
                    });
                }

                var next = await LiveActionRun.ApplyAsync(Http(), liveService, hub, audit,
                    scope.Match, actorId, ParseTournamentId(tournamentId), ParseMatchId(matchId),
                    expectedVersion, parsed);

                return new McpToolPayload(new
                {
                    version = next.Version,
                    roundId = next.RoundId,
                    state = next.State,
                    archive = next.Archive
                });
            });
}
