using Microsoft.AspNetCore.RateLimiting;
using AOC.Api.Http;
using AOC.Api.Modules.Tournaments;
using AOC.Infrastructure.Data.Entities;
using AOC.Infrastructure.Configuration;

namespace AOC.Api.Modules.Recording;

/// <summary>Port of recording/index.ts route handlers.</summary>
public static class RecordingRoutes
{
    public static IEndpointRouteBuilder MapRecordingRoutes(this IEndpointRouteBuilder app)
    {
        // POST /portal/tournaments/:tournamentId/matches/:matchId/recording/start
        app.MapPost("/portal/tournaments/{tournamentId}/matches/{matchId}/recording/start", async (HttpContext http) =>
        {
            var user = await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
            var tournamentId = Validate.RouteUuid(http, "tournamentId");
            var matchId = Validate.RouteUuid(http, "matchId");
            await TournamentGuards.AssertWriteAsync(http, tournamentId);

            var service = http.RequestServices.GetRequiredService<RecordingService>();
            var recording = await service.StartRecordingAsync(tournamentId, matchId,
                new RecordingService.StartOptions(user.Id));
            return Results.Json(new { recording = Present(recording) }, JsonApi.Options);
        });

        // POST /portal/tournaments/:tournamentId/matches/:matchId/recording/stop
        app.MapPost("/portal/tournaments/{tournamentId}/matches/{matchId}/recording/stop", async (HttpContext http) =>
        {
            var user = await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
            var tournamentId = Validate.RouteUuid(http, "tournamentId");
            var matchId = Validate.RouteUuid(http, "matchId");
            await TournamentGuards.AssertWriteAsync(http, tournamentId);

            var service = http.RequestServices.GetRequiredService<RecordingService>();
            var (row, egressStatus) = await service.StopRecordingAsync(matchId);
            return Results.Json(new
            {
                recording = Present(row),
                egressStatus = egressStatus is { } status
                    ? RecordingService.EgressStatusLabel(status)
                    : null
            }, JsonApi.Options);
        });

        // GET /portal/tournaments/:tournamentId/matches/:matchId/recording
        app.MapGet("/portal/tournaments/{tournamentId}/matches/{matchId}/recording", async (HttpContext http) =>
        {
            var user = await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
            var tournamentId = Validate.RouteUuid(http, "tournamentId");
            var matchId = Validate.RouteUuid(http, "matchId");
            await TournamentGuards.AssertViewAsync(http, tournamentId);

            var service = http.RequestServices.GetRequiredService<RecordingService>();
            var items = await service.ListRecordingsAsync(tournamentId, matchId);
            return Results.Json(new { items }, JsonApi.Options);
        });

        return app;
    }

    private static object Present(RecordingEntity row) => new
    {
        row.Id,
        row.MatchId,
        row.EgressId,
        Status = row.Status.ToString(),
        row.S3Key,
        row.StartedBy,
        row.StartedAt,
        row.StoppedAt,
        row.Error
    };
}
