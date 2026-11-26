using AOC.Api.Http;
using AOC.Api.Modules.Matches;
using AOC.Api.Modules.Tournaments;
using AOC.Infrastructure.Configuration;
using AOC.Infrastructure.Data;
using AOC.Infrastructure.Data.Entities;

namespace AOC.Api.Shared;

public static class TournamentAccess
{
    public static bool CanView(TournamentEntity row, UserEntity user)
    {
        if (row.Visibility == Visibility.PUBLIC) return true;
        if (row.OwnerId == user.Id) return true;
        return user.Role == UserRole.ADMIN;
    }

    public static bool CanWrite(TournamentEntity row, UserEntity user)
    {
        if (user.Role == UserRole.ADMIN) return true;
        return row.OwnerId == user.Id;
    }

    public static async Task<TournamentEntity> RequireViewAsync(HttpContext http, string tournamentId)
    {
        var user = await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
        var tournament = await LoadAsync(http, tournamentId);
        if (!CanView(tournament, user)) throw NotFound(tournamentId);
        return tournament;
    }

    public static async Task<TournamentEntity> RequireWriteAsync(HttpContext http, string tournamentId)
    {
        var user = await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
        var tournament = await LoadAsync(http, tournamentId);
        if (!CanView(tournament, user)) throw NotFound(tournamentId);
        if (!CanWrite(tournament, user)) throw Forbidden();
        return tournament;
    }

    public static async Task<MatchesService.MatchScope> RequireMatchAsync(
        HttpContext http, string tournamentId, string matchId, bool write)
    {
        var user = await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
        var matches = http.RequestServices.GetRequiredService<MatchesService>();
        var scope = await matches.RequireMatchScopeAsync(tournamentId, matchId);
        if (write)
        {
            if (!CanWrite(scope.Tournament, user)) throw Forbidden();
            return scope;
        }
        if (!CanView(scope.Tournament, user)) throw NotFound(tournamentId);
        return scope;
    }

    private static Task<TournamentEntity> LoadAsync(HttpContext http, string tournamentId)
        => http.RequestServices.GetRequiredService<TournamentsService>().RequireTournamentAsync(tournamentId);

    private static TournamentError NotFound(string tournamentId)
        => new(TournamentErrorCode.NOT_FOUND, $"tournament {tournamentId} not found");

    private static TournamentError Forbidden()
        => new(TournamentErrorCode.FORBIDDEN, "Only the owner or an admin may manage this tournament");
}
