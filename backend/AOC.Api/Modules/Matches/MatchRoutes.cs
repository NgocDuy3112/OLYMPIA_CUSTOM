using System.Text.Json;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using AOC.Api.Http;
using AOC.Api.Shared;
using AOC.Infrastructure.Configuration;
using AOC.Infrastructure.Data;

namespace AOC.Api.Modules.Matches;

public static class MatchRoutes
{
    public static IEndpointRouteBuilder MapMatchRoutes(this IEndpointRouteBuilder app)
    {
        app.MapPost("/portal/tournaments/{tournamentId}/matches", async (HttpContext http) =>
        {
            var tournamentId = Validate.RouteUuid(http, "tournamentId");
            await TournamentAccess.RequireWriteAsync(http, tournamentId);
            var body = await Validate.ReadJsonBodyAsync(http);
            var service = http.RequestServices.GetRequiredService<MatchesService>();

            var input = MatchSchemas.ParseCreate(body);
            var row = await service.CreateMatchAsync(tournamentId, input);
            http.Response.StatusCode = 201;
            return Results.Json(row, JsonApi.Options);
        });

        app.MapGet("/portal/tournaments/{tournamentId}/matches", async (HttpContext http) =>
        {
            var tournamentId = Validate.RouteUuid(http, "tournamentId");
            await TournamentAccess.RequireViewAsync(http, tournamentId);
            var query = Validate.Query(http);
            var service = http.RequestServices.GetRequiredService<MatchesService>();

            var status = query.GetValueOrDefault("status");
            if (status is not null && status is not ("UPCOMING" or "LIVE" or "FINISHED"))
                throw ApiException.BadRequest("status must be one of UPCOMING, LIVE, FINISHED");

            var rows = await service.ListMatchesAsync(tournamentId, status, Pagination.ParsePage(query));
            return Results.Json(rows, JsonApi.Options);
        });

        app.MapGet("/portal/tournaments/{tournamentId}/matches/{matchId}", async (HttpContext http) =>
        {
            var tournamentId = Validate.RouteUuid(http, "tournamentId");
            var matchId = Validate.RouteUuid(http, "matchId");
            var scope = await MatchEndpoints.RequireAsync(http, tournamentId, matchId, write: false);
            var assembly = http.RequestServices.GetRequiredService<MatchAssemblyService>();

            var assemblyEvents = await assembly.EventsAsync(matchId);
            return Results.Json(MatchDetail.Of(scope.Scope.Match, assemblyEvents), JsonApi.Options);
        });

        app.MapPatch("/portal/tournaments/{tournamentId}/matches/{matchId}", async (HttpContext http) =>
        {
            var tournamentId = Validate.RouteUuid(http, "tournamentId");
            var matchId = Validate.RouteUuid(http, "matchId");
            await MatchEndpoints.RequireAsync(http, tournamentId, matchId, write: true);
            var body = await Validate.ReadJsonBodyAsync(http);
            var service = http.RequestServices.GetRequiredService<MatchesService>();

            var patch = MatchSchemas.ParseUpdate(body);
            var row = await service.UpdateMatchAsync(tournamentId, matchId, patch);
            return Results.Json(row, JsonApi.Options);
        });

        app.MapDelete("/portal/tournaments/{tournamentId}/matches/{matchId}/players/{userId}", async (HttpContext http) =>
        {
            var tournamentId = Validate.RouteUuid(http, "tournamentId");
            var matchId = Validate.RouteUuid(http, "matchId");
            var userId = Validate.RouteUuid(http, "userId");
            await MatchEndpoints.RequireAsync(http, tournamentId, matchId, write: true);
            var service = http.RequestServices.GetRequiredService<MatchesService>();

            await service.EjectSeatAsync(tournamentId, matchId, userId);
            await AuditAsync(http, "seat_ejected", matchId, new Dictionary<string, object?>
            {
                ["tournamentId"] = tournamentId,
                ["seatEjected"] = userId
            });

            http.Response.StatusCode = 204;
            return Results.Empty;
        });

        app.MapDelete("/portal/tournaments/{tournamentId}/matches/{matchId}", async (HttpContext http) =>
        {
            var tournamentId = Validate.RouteUuid(http, "tournamentId");
            var matchId = Validate.RouteUuid(http, "matchId");
            await http.RequireRoleAsync(Surface.PORTAL, "ADMIN");
            var service = http.RequestServices.GetRequiredService<MatchesService>();

            await service.RequireMatchScopeAsync(tournamentId, matchId);
            await service.DeleteMatchAsync(tournamentId, matchId);
            http.Response.StatusCode = 204;
            return Results.Empty;
        });

        return app;
    }

    internal static Task AuditAsync(HttpContext http, string action, string? matchId,
        Dictionary<string, object?>? details)
    {
        var user = http.Items.TryGetValue(Guards.SessionUserKey, out var u)
            ? u as Infrastructure.Data.Entities.UserEntity
            : null;
        var audit = http.RequestServices.GetRequiredService<AOC.Infrastructure.Audit.AuditService>();
        return audit.AuditAsync(new AOC.Infrastructure.Audit.AuditEvent
        {
            Action = action,
            ActorId = user?.Id,
            MatchId = matchId is null ? null : Guid.Parse(matchId),
            Details = details,
            Ip = http.Connection.RemoteIpAddress?.ToString(),
            UserAgent = http.Request.Headers.UserAgent.ToString()
        });
    }
}
