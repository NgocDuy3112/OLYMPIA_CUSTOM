using AOC.Api.Realtime;
using AOC.Api.Shared;
using AOC.Domain.Contracts;
using AOC.Infrastructure.Audit;
using AOC.Infrastructure.Data;
using AOC.Infrastructure.Data.Entities;

namespace AOC.Api.Modules.Matches;

public static class MatchStatusChange
{
    public sealed record StatusAudit(string TournamentId, string From, string To, string Label);

    public static async Task NotifyAsync(
        HttpContext http,
        MatchHubRegistry hub,
        AuditService audit,
        Guid? actorId,
        Guid tournamentId,
        string matchId,
        MatchStatus previous,
        MatchEntity match)
    {
        if (match.Status == previous) return;

        await hub.PublishAsync(matchId);
        var action = match.Status == MatchStatus.LIVE ? "match_started" : "match_ended";
        await audit.AuditAsync(http, actorId, AuditTarget.Match(matchId), action,
            new StatusAudit(tournamentId.ToString(), previous.ToString(), match.Status.ToString(),
                match.Label));
    }
}
