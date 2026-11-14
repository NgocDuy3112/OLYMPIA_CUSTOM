using System.Text.Json;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using AOC.Api.Http;
using AOC.Api.Shared;
using AOC.Infrastructure.Configuration;
using AOC.Infrastructure.Data;

namespace AOC.Api.Modules.Matches;

/// <summary>Port of matches/routes.ts + matches/assemble-patch.ts.</summary>
public static class MatchRoutes
{
    public static IEndpointRouteBuilder MapMatchRoutes(this IEndpointRouteBuilder app)
    {
        // POST /portal/tournaments/:tournamentId/matches
        app.MapPost("/portal/tournaments/{tournamentId}/matches", async (HttpContext http) =>
        {
            var user = await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
            var tournamentId = Validate.RouteUuid(http, "tournamentId");
            var body = await Validate.ReadJsonBodyAsync(http);
            var service = http.RequestServices.GetRequiredService<MatchesService>();

            var scope = await service.RequireMatchScopeAsync(tournamentId);
            AssertView(scope.Tournament, user, tournamentId);
            AssertWrite(scope.Tournament, user);

            var input = MatchSchemas.ParseCreate(body);
            var row = await service.CreateMatchAsync(tournamentId, input);
            http.Response.StatusCode = 201;
            return Results.Json(row, JsonApi.Options);
        });

        // GET /portal/tournaments/:tournamentId/matches
        app.MapGet("/portal/tournaments/{tournamentId}/matches", async (HttpContext http) =>
        {
            var user = await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
            var tournamentId = Validate.RouteUuid(http, "tournamentId");
            var query = Validate.Query(http);
            var service = http.RequestServices.GetRequiredService<MatchesService>();

            var scope = await service.RequireMatchScopeAsync(tournamentId);
            AssertView(scope.Tournament, user, tournamentId);

            var status = query.GetValueOrDefault("status");
            if (status is not null && status is not ("UPCOMING" or "LIVE" or "FINISHED"))
                throw ApiException.BadRequest("status must be one of UPCOMING, LIVE, FINISHED");

            var rows = await service.ListMatchesAsync(tournamentId, status, Pagination.ParsePage(query));
            return Results.Json(rows, JsonApi.Options);
        });

        // GET /portal/tournaments/:tournamentId/matches/:matchId
        app.MapGet("/portal/tournaments/{tournamentId}/matches/{matchId}", async (HttpContext http) =>
        {
            var user = await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
            var tournamentId = Validate.RouteUuid(http, "tournamentId");
            var matchId = Validate.RouteUuid(http, "matchId");
            var service = http.RequestServices.GetRequiredService<MatchesService>();

            var scope = await service.RequireMatchScopeAsync(tournamentId);
            AssertView(scope.Tournament, user, tournamentId);

            var match = await service.GetMatchAsync(tournamentId, matchId);
            var payload = JsonSerializer
                .SerializeToElement(match, JsonDefaults.Options)
                .Deserialize<Dictionary<string, JsonElement>>()!;
            payload["assemblyEvents"] = JsonSerializer.SerializeToElement(
                await service.GetMatchAssemblyEventsAsync(matchId), JsonDefaults.Options);
            return Results.Json(payload, JsonApi.Options);
        });

        // POST /portal/tournaments/:tournamentId/matches/:matchId/results
        app.MapPost("/portal/tournaments/{tournamentId}/matches/{matchId}/results", async (HttpContext http) =>
        {
            var user = await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
            var tournamentId = Validate.RouteUuid(http, "tournamentId");
            var matchId = Validate.RouteUuid(http, "matchId");
            var body = await Validate.ReadJsonBodyAsync(http);
            var service = http.RequestServices.GetRequiredService<MatchesService>();

            var scope = await service.RequireMatchScopeAsync(tournamentId);
            AssertView(scope.Tournament, user, tournamentId);
            AssertWrite(scope.Tournament, user);

            var input = MatchSchemas.ParseSetResults(body);
            var match = await service.SetMatchResultsAsync(tournamentId, matchId, input.Totals);

            await AuditAsync(http, "match_ended", matchId, new Dictionary<string, object?>
            {
                ["tournamentId"] = tournamentId,
                ["manual"] = true,
                ["totals"] = input.Totals.Select(t => new { userId = t.UserId, score = t.Score }).ToList()
            });

            return Results.Json(match, JsonApi.Options);
        });

        // PATCH /portal/tournaments/:tournamentId/matches/:matchId
        app.MapPatch("/portal/tournaments/{tournamentId}/matches/{matchId}", async (HttpContext http) =>
        {
            var user = await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
            var tournamentId = Validate.RouteUuid(http, "tournamentId");
            var matchId = Validate.RouteUuid(http, "matchId");
            var body = await Validate.ReadJsonBodyAsync(http);
            var service = http.RequestServices.GetRequiredService<MatchesService>();

            var scope = await service.RequireMatchScopeAsync(tournamentId);
            AssertView(scope.Tournament, user, tournamentId);
            AssertWrite(scope.Tournament, user);

            await service.GetMatchAsync(tournamentId, matchId);
            var patch = MatchSchemas.ParseUpdate(body);
            var row = await service.UpdateMatchAsync(tournamentId, matchId, patch);
            return Results.Json(row, JsonApi.Options);
        });

        // POST /portal/tournaments/:tournamentId/matches/:matchId/assemble  (replace)
        app.MapPost("/portal/tournaments/{tournamentId}/matches/{matchId}/assemble", async (HttpContext http) =>
        {
            var user = await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
            var tournamentId = Validate.RouteUuid(http, "tournamentId");
            var matchId = Validate.RouteUuid(http, "matchId");
            var body = await Validate.ReadJsonBodyAsync(http);
            var service = http.RequestServices.GetRequiredService<MatchesService>();

            var scope = await service.RequireMatchScopeAsync(tournamentId);
            AssertView(scope.Tournament, user, tournamentId);
            AssertWrite(scope.Tournament, user);

            await service.GetMatchAsync(tournamentId, matchId);
            var entries = MatchSchemas.ParseAssemble(body);
            var row = await service.AssembleMatchAsync(tournamentId, matchId, entries);
            return Results.Json(row, JsonApi.Options);
        });

        // PATCH .../assemble  (patch with baseRevision)
        app.MapPatch("/portal/tournaments/{tournamentId}/matches/{matchId}/assemble", async (HttpContext http) =>
        {
            var user = await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
            var tournamentId = Validate.RouteUuid(http, "tournamentId");
            var matchId = Validate.RouteUuid(http, "matchId");
            var body = await Validate.ReadJsonBodyAsync(http);
            var service = http.RequestServices.GetRequiredService<MatchesService>();
            var assembly = http.RequestServices.GetRequiredService<AssemblePatchService>();

            var scope = await service.RequireMatchScopeAsync(tournamentId);
            if (!TournamentAccess.CanView(scope.Tournament, user))
                throw new MatchError(MatchErrorCode.NOT_FOUND, $"tournament {tournamentId} not found");
            if (!TournamentAccess.CanWrite(scope.Tournament, user))
                throw new MatchError(MatchErrorCode.FORBIDDEN,
                    "Only the owner or an admin may manage this tournament's matches");

            var input = MatchSchemas.ParsePatchAssemble(body);
            var result = await assembly.PatchAssembleAsync(tournamentId, matchId, input, user.Id);
            return Results.Json(new { assemblyRevision = result.AssemblyRevision }, JsonApi.Options);
        });

        // PATCH /portal/tournaments/:tournamentId/matches/:matchId/status
        app.MapPatch("/portal/tournaments/{tournamentId}/matches/{matchId}/status", async (HttpContext http) =>
        {
            var user = await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
            var tournamentId = Validate.RouteUuid(http, "tournamentId");
            var matchId = Validate.RouteUuid(http, "matchId");
            var body = await Validate.ReadJsonBodyAsync(http);
            var service = http.RequestServices.GetRequiredService<MatchesService>();

            var scope = await service.RequireMatchScopeAsync(tournamentId);
            AssertView(scope.Tournament, user, tournamentId);
            AssertWrite(scope.Tournament, user);

            var status = MatchSchemas.ParseTransition(body);
            var previous = await service.GetMatchAsync(tournamentId, matchId);
            var match = await service.TransitionMatchAsync(tournamentId, matchId, status);

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

        // DELETE .../players/:userId  (eject seat)
        app.MapDelete("/portal/tournaments/{tournamentId}/matches/{matchId}/players/{userId}", async (HttpContext http) =>
        {
            var user = await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
            var tournamentId = Validate.RouteUuid(http, "tournamentId");
            var matchId = Validate.RouteUuid(http, "matchId");
            var userId = Validate.RouteUuid(http, "userId");
            var service = http.RequestServices.GetRequiredService<MatchesService>();

            var scope = await service.RequireMatchScopeAsync(tournamentId);
            AssertView(scope.Tournament, user, tournamentId);
            AssertWrite(scope.Tournament, user);

            await service.EjectSeatAsync(tournamentId, matchId, userId);
            await AuditAsync(http, "tournament_updated", matchId, new Dictionary<string, object?>
            {
                ["tournamentId"] = tournamentId,
                ["seatEjected"] = userId
            });

            http.Response.StatusCode = 204;
            return Results.Empty;
        });

        // DELETE /portal/tournaments/:tournamentId/matches/:matchId
        app.MapDelete("/portal/tournaments/{tournamentId}/matches/{matchId}", async (HttpContext http) =>
        {
            await http.RequireRoleAsync(Surface.PORTAL, "ADMIN");
            var tournamentId = Validate.RouteUuid(http, "tournamentId");
            var matchId = Validate.RouteUuid(http, "matchId");
            var service = http.RequestServices.GetRequiredService<MatchesService>();

            await service.RequireMatchScopeAsync(tournamentId);
            await service.DeleteMatchAsync(tournamentId, matchId);
            http.Response.StatusCode = 204;
            return Results.Empty;
        });

        // GET /portal/.../recording  (moved from recording module? no — kept in recording routes)

        return app;
    }

    internal static void AssertView(Infrastructure.Data.Entities.TournamentEntity tournament,
        Infrastructure.Data.Entities.UserEntity user, string tournamentId)
    {
        if (!TournamentAccess.CanView(tournament, user))
            throw new MatchError(MatchErrorCode.NOT_FOUND, $"tournament {tournamentId} not found");
    }

    internal static void AssertWrite(Infrastructure.Data.Entities.TournamentEntity tournament,
        Infrastructure.Data.Entities.UserEntity user)
    {
        if (!TournamentAccess.CanWrite(tournament, user))
            throw new MatchError(MatchErrorCode.FORBIDDEN,
                "Only the owner or an admin may manage this tournament's matches");
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
