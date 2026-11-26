using Microsoft.AspNetCore.RateLimiting;
using AOC.Api.Http;
using AOC.Api.Shared;
using AOC.Infrastructure.Audit;
using AOC.Infrastructure.Configuration;

namespace AOC.Api.Modules.Standings;

public static class StandingsRoutes
{
    public static IEndpointRouteBuilder MapStandingsRoutes(this IEndpointRouteBuilder app)
    {
        app.MapGet("/portal/tournaments/{tournamentId}/standings", async (HttpContext http) =>
        {
            var tournamentId = Validate.RouteUuid(http, "tournamentId");
            await TournamentAccess.RequireViewAsync(http, tournamentId);
            var service = http.RequestServices.GetRequiredService<StandingsService>();
            var rows = await service.GetStandingsAsync(tournamentId);
            return Results.Json(new { rows }, JsonApi.Options);
        });

        app.MapGet("/portal/tournaments/{tournamentId}/groups", async (HttpContext http) =>
        {
            var tournamentId = Validate.RouteUuid(http, "tournamentId");
            await TournamentAccess.RequireViewAsync(http, tournamentId);
            var service = http.RequestServices.GetRequiredService<GroupTablesService>();
            return Results.Json(await service.GetGroupTablesAsync(tournamentId), JsonApi.Options);
        });

        app.MapPost("/portal/tournaments/{tournamentId}/standings/recompute", async (HttpContext http) =>
        {
            var tournamentId = Validate.RouteUuid(http, "tournamentId");
            await TournamentAccess.RequireWriteAsync(http, tournamentId);

            var service = http.RequestServices.GetRequiredService<StandingsService>();
            var rows = await service.RecomputeStandingsAsync(tournamentId);

            var audit = http.RequestServices.GetRequiredService<AuditService>();
            await audit.AuditAsync(http, AuditTarget.None, "standings_recomputed",
                new StandingsRecomputedAudit(tournamentId, rows.Count));

            return Results.Json(new { rows }, JsonApi.Options);
        });

        return app;
    }

    private sealed record StandingsRecomputedAudit(string TournamentId, int Standings);
}
