using AOC.Api.Http;
using AOC.Api.Modules.Matches;
using AOC.Api.Shared;
using AOC.Infrastructure.Data.Entities;

namespace AOC.Api.Modules.Live;

/// <summary>
/// Single tenant guard for live endpoints: the tournament id on the route must own the match id,
/// and the caller must be allowed to see that tournament. Every failure maps to 404 so a match in
/// another tournament is indistinguishable from a match that does not exist.
/// </summary>
public static class LiveMatchGuard
{
    public static async Task<MatchEntity> RequirePairAsync(
        HttpContext http, string tournamentId, string matchId)
    {
        var matches = http.RequestServices.GetRequiredService<MatchesService>();
        try
        {
            return await matches.GetMatchAsync(tournamentId, matchId);
        }
        catch (MatchError)
        {
            throw ApiException.NotFound($"match {matchId} not found");
        }
    }

    public static async Task<MatchEntity> RequireSpectatableAsync(
        HttpContext http, string tournamentId, string matchId)
    {
        var match = await RequirePairAsync(http, tournamentId, matchId);
        var live = http.RequestServices.GetRequiredService<LiveService>();
        if (!await live.IsTournamentPublicAsync(match.TournamentId))
            throw ApiException.NotFound($"tournament {tournamentId} not found");
        return match;
    }

    public static async Task<MatchEntity> RequirePortalAsync(
        HttpContext http, string tournamentId, string matchId, UserEntity user)
    {
        var match = await RequirePairAsync(http, tournamentId, matchId);
        var matches = http.RequestServices.GetRequiredService<MatchesService>();

        TournamentEntity tournament;
        try
        {
            tournament = await matches.RequireTournamentAsync(match.TournamentId);
        }
        catch (MatchError)
        {
            throw ApiException.NotFound($"tournament {tournamentId} not found");
        }

        if (!TournamentAccess.CanView(tournament, user))
            throw ApiException.NotFound($"tournament {tournamentId} not found");
        return match;
    }

    public static async Task<MatchEntity> RequirePortalWriteAsync(
        HttpContext http, string tournamentId, string matchId, UserEntity user)
    {
        var match = await RequirePairAsync(http, tournamentId, matchId);
        var matches = http.RequestServices.GetRequiredService<MatchesService>();

        TournamentEntity tournament;
        try
        {
            tournament = await matches.RequireTournamentAsync(match.TournamentId);
        }
        catch (MatchError)
        {
            throw ApiException.NotFound($"tournament {tournamentId} not found");
        }

        if (!TournamentAccess.CanView(tournament, user))
            throw ApiException.NotFound($"tournament {tournamentId} not found");
        if (!TournamentAccess.CanWrite(tournament, user))
            throw ApiException.Forbidden("Only the owner or an admin may open the console");
        return match;
    }
}
