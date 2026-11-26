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
            await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
            var tournamentId = Validate.RouteUuid(http, "tournamentId");
            var body = await Validate.ReadJsonBodyAsync(http);
            var service = http.RequestServices.GetRequiredService<MatchesService>();

            await TournamentAccess.RequireWriteAsync(http, tournamentId);

            var input = MatchSchemas.ParseCreate(body);
            var row = await service.CreateMatchAsync(tournamentId, input);
            http.Response.StatusCode = 201;
            return Results.Json(row, JsonApi.Options);
        });

        app.MapGet("/portal/tournaments/{tournamentId}/matches", async (HttpContext http) =>
        {
            await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
            var tournamentId = Validate.RouteUuid(http, "tournamentId");
            var query = Validate.Query(http);
            var service = http.RequestServices.GetRequiredService<MatchesService>();

            await TournamentAccess.RequireViewAsync(http, tournamentId);

            var status = query.GetValueOrDefault("status");
            if (status is not null && status is not ("UPCOMING" or "LIVE" or "FINISHED"))
                throw ApiException.BadRequest("status must be one of UPCOMING, LIVE, FINISHED");

            var rows = await service.ListMatchesAsync(tournamentId, status, Pagination.ParsePage(query));
            return Results.Json(rows, JsonApi.Options);
        });

        app.MapGet("/portal/tournaments/{tournamentId}/matches/{matchId}", async (HttpContext http) =>
        {
            await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
            var tournamentId = Validate.RouteUuid(http, "tournamentId");
            var matchId = Validate.RouteUuid(http, "matchId");
            var assembly = http.RequestServices.GetRequiredService<MatchAssemblyService>();

            var scope = await TournamentAccess.RequireMatchAsync(http, tournamentId, matchId, write: false);

            var assemblyEvents = await assembly.EventsAsync(matchId);
            return Results.Json(MatchDetail.Of(scope.Match, assemblyEvents), JsonApi.Options);
        });

        app.MapPost("/portal/tournaments/{tournamentId}/matches/{matchId}/results", async (HttpContext http) =>
        {
            await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
            var tournamentId = Validate.RouteUuid(http, "tournamentId");
            var matchId = Validate.RouteUuid(http, "matchId");
            var body = await Validate.ReadJsonBodyAsync(http);
            var scoring = http.RequestServices.GetRequiredService<MatchScoringService>();

            await TournamentAccess.RequireWriteAsync(http, tournamentId);

            var input = MatchSchemas.ParseSetResults(body);
            var match = await scoring.SetMatchResultsAsync(tournamentId, matchId, input.Totals);

            await AuditAsync(http, "match_results_saved", matchId, new Dictionary<string, object?>
            {
                ["tournamentId"] = tournamentId,
                ["manual"] = true,
                ["totals"] = input.Totals.Select(t => new { userId = t.UserId, score = t.Score }).ToList()
            });

            return Results.Json(match, JsonApi.Options);
        });

        app.MapPatch("/portal/tournaments/{tournamentId}/matches/{matchId}", async (HttpContext http) =>
        {
            await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
            var tournamentId = Validate.RouteUuid(http, "tournamentId");
            var matchId = Validate.RouteUuid(http, "matchId");
            var body = await Validate.ReadJsonBodyAsync(http);
            var service = http.RequestServices.GetRequiredService<MatchesService>();

            await TournamentAccess.RequireWriteAsync(http, tournamentId);

            var patch = MatchSchemas.ParseUpdate(body);
            var row = await service.UpdateMatchAsync(tournamentId, matchId, patch);
            return Results.Json(row, JsonApi.Options);
        });

        app.MapPatch("/portal/tournaments/{tournamentId}/matches/{matchId}/assemble", async (HttpContext http) =>
        {
            var user = await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
            var tournamentId = Validate.RouteUuid(http, "tournamentId");
            var matchId = Validate.RouteUuid(http, "matchId");
            var body = await Validate.ReadJsonBodyAsync(http);
            var service = http.RequestServices.GetRequiredService<MatchesService>();
            var assembly = http.RequestServices.GetRequiredService<AssemblePatchService>();

            await TournamentAccess.RequireWriteAsync(http, tournamentId);

            var input = MatchSchemas.ParsePatchAssemble(body);
            var result = await assembly.PatchAssembleAsync(tournamentId, matchId, input, user.Id);
            return Results.Json(new { assemblyRevision = result.AssemblyRevision }, JsonApi.Options);
        });

        app.MapPatch("/portal/tournaments/{tournamentId}/matches/{matchId}/status", async (HttpContext http) =>
        {
            await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
            var tournamentId = Validate.RouteUuid(http, "tournamentId");
            var matchId = Validate.RouteUuid(http, "matchId");
            var body = await Validate.ReadJsonBodyAsync(http);
            var transitions = http.RequestServices.GetRequiredService<MatchTransitionService>();

            await TournamentAccess.RequireWriteAsync(http, tournamentId);
            var scope = await http.RequestServices.GetRequiredService<MatchesService>()
                .RequireMatchScopeAsync(tournamentId, matchId);

            var status = MatchSchemas.ParseTransition(body);
            var previous = scope.Match;
            var match = await transitions.TransitionMatchAsync(tournamentId, matchId, status);

            if (match.Status != previous.Status)
            {
                var hubRegistry = http.RequestServices.GetRequiredService<AOC.Api.Realtime.MatchHubRegistry>();
                await hubRegistry.PublishAsync(matchId);
            }

            if (match.Status != previous.Status)
            {
                var action = match.Status == MatchStatus.LIVE ? "match_started" : "match_ended";
                await AuditAsync(http, action, matchId, new Dictionary<string, object?>
                {
                    ["tournamentId"] = tournamentId,
                    ["from"] = previous.Status.ToString(),
                    ["to"] = match.Status.ToString(),
                    ["label"] = match.Label
                });
            }

            return Results.Json(match, JsonApi.Options);
        });

        app.MapDelete("/portal/tournaments/{tournamentId}/matches/{matchId}/players/{userId}", async (HttpContext http) =>
        {
            await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
            var tournamentId = Validate.RouteUuid(http, "tournamentId");
            var matchId = Validate.RouteUuid(http, "matchId");
            var userId = Validate.RouteUuid(http, "userId");
            var service = http.RequestServices.GetRequiredService<MatchesService>();

            await TournamentAccess.RequireWriteAsync(http, tournamentId);

            await service.EjectSeatAsync(tournamentId, matchId, userId);
            await AuditAsync(http, "tournament_updated", matchId, new Dictionary<string, object?>
            {
                ["tournamentId"] = tournamentId,
                ["seatEjected"] = userId
            });

            http.Response.StatusCode = 204;
            return Results.Empty;
        });

        app.MapDelete("/portal/tournaments/{tournamentId}/matches/{matchId}", async (HttpContext http) =>
        {
            await http.RequireRoleAsync(Surface.PORTAL, "ADMIN");
            var tournamentId = Validate.RouteUuid(http, "tournamentId");
            var matchId = Validate.RouteUuid(http, "matchId");
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
