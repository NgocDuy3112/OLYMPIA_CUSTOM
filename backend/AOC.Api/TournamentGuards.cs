using AOC.Api.Http;
using AOC.Api.Modules.Tournaments;
using AOC.Api.Shared;
using AOC.Infrastructure.Configuration;
using AOC.Infrastructure.Data.Entities;

namespace AOC.Api;

/// <summary>Port of tournament-shared.ts tournamentGuards() + error handler.</summary>
public static class TournamentGuards
{
    /// <summary>Staff auth + viewability: 404 when the viewer may not see it.</summary>
    public static async Task<TournamentEntity> AssertViewAsync(HttpContext http, string tournamentId)
    {
        var user = await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
        var service = http.RequestServices.GetRequiredService<TournamentsService>();
        var tournament = await service.RequireTournamentAsync(tournamentId);
        if (!TournamentAccess.CanView(tournament, user))
            throw new TournamentError(TournamentErrorCode.NOT_FOUND, "tournament not found");
        return tournament;
    }

    /// <summary>Staff auth + writability: 404 when unviewable, 403 when read-only.</summary>
    public static async Task<TournamentEntity> AssertWriteAsync(HttpContext http, string tournamentId)
    {
        var user = await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
        var service = http.RequestServices.GetRequiredService<TournamentsService>();
        var tournament = await service.RequireTournamentAsync(tournamentId);
        if (!TournamentAccess.CanView(tournament, user))
            throw new TournamentError(TournamentErrorCode.NOT_FOUND, "tournament not found");
        if (!TournamentAccess.CanWrite(tournament, user))
            throw new TournamentError(TournamentErrorCode.FORBIDDEN,
                "only the owner or an admin may manage this tournament");
        return tournament;
    }
}
