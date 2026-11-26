using System.Text.Json;
using AOC.Api.Realtime;
using AOC.Api.Shared;
using AOC.Infrastructure.Audit;
using AOC.Infrastructure.Data.Entities;

namespace AOC.Api.Modules.Live;

public static class LiveActionRun
{
    public static async Task<LiveRecord<JsonElement>> ApplyAsync(
        HttpContext http,
        LiveService service,
        MatchHubRegistry hub,
        AuditService audit,
        MatchEntity match,
        Guid actorId,
        Guid tournamentId,
        Guid matchId,
        int expectedVersion,
        LiveAction action)
    {
        await service.RequireControllerAsync(match, actorId);
        var applied = await service.ApplyLiveActionAsync(
            tournamentId, matchId, expectedVersion, action, actorId);
        var next = applied.Record;

        await hub.PublishAsync(matchId.ToString());
        if (action.Describe(next.RoundId) is { } described)
            await audit.AuditAsync(http, actorId, AuditTarget.Match(matchId.ToString()),
                described.Action, described.Details);

        foreach (var change in applied.VerdictChanges)
            await audit.AuditAsync(http, actorId, AuditTarget.Match(matchId.ToString()),
                "answer_verdict_changed", change);

        return next;
    }
}
