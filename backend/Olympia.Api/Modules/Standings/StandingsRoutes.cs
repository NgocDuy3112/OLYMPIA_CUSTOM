using Microsoft.AspNetCore.RateLimiting;
using Olympia.Api.Http;
using Olympia.Api.Shared;
using Olympia.Infrastructure.Configuration;

namespace Olympia.Api.Modules.Standings;

/// <summary>Port of standings/routes.ts.</summary>
public static class StandingsRoutes
{
    public static IEndpointRouteBuilder MapStandingsRoutes(this IEndpointRouteBuilder app)
    {
        app.MapGet("/portal/tournaments/{tournamentId}/standings", async (HttpContext http) =>
        {
            var tournamentId = Validate.RouteUuid(http, "tournamentId");
            await TournamentGuards.AssertViewAsync(http, tournamentId);
            var service = http.RequestServices.GetRequiredService<StandingsService>();
            var rows = await service.GetStandingsAsync(tournamentId);
            return Results.Json(new { rows }, JsonApi.Options);
        });

        app.MapGet("/portal/tournaments/{tournamentId}/groups", async (HttpContext http) =>
        {
            var tournamentId = Validate.RouteUuid(http, "tournamentId");
            await TournamentGuards.AssertViewAsync(http, tournamentId);
            var service = http.RequestServices.GetRequiredService<GroupTablesService>();
            return Results.Json(await service.GetGroupTablesAsync(tournamentId), JsonApi.Options);
        });

        app.MapPost("/portal/tournaments/{tournamentId}/standings/recompute", async (HttpContext http) =>
        {
            var tournamentId = Validate.RouteUuid(http, "tournamentId");
            var user = await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
            await TournamentGuards.AssertWriteAsync(http, tournamentId);

            var service = http.RequestServices.GetRequiredService<StandingsService>();
            var rows = await service.RecomputeStandingsAsync(tournamentId);

            var audit = http.RequestServices.GetRequiredService<Olympia.Infrastructure.Audit.AuditService>();
            await audit.AuditAsync(new Olympia.Infrastructure.Audit.AuditEvent
            {
                Action = "tournament_updated",
                ActorId = user.Id,
                Ip = http.Connection.RemoteIpAddress?.ToString(),
                UserAgent = http.Request.Headers.UserAgent.ToString(),
                Details = new Dictionary<string, object?> { ["tournamentId"] = tournamentId, ["standings"] = rows.Count }
            });

            return Results.Json(new { rows }, JsonApi.Options);
        });

        return app;
    }
}
