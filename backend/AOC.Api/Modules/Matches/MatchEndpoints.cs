using AOC.Api.Http;
using AOC.Api.Shared;
using AOC.Infrastructure.Data.Entities;

namespace AOC.Api.Modules.Matches;

internal static class MatchEndpoints
{
    internal sealed record RouteMatch(UserEntity User, MatchesService.MatchScope Scope);

    internal static async Task<RouteMatch> RequireAsync(
        HttpContext http, string tournamentId, string matchId, bool write)
    {
        var scope = await TournamentAccess.RequireMatchAsync(http, tournamentId, matchId, write);
        return new RouteMatch(http.SessionUser(), scope);
    }
}
