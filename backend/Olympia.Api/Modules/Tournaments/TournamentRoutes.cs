using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.RateLimiting;
using Olympia.Api.Http;
using Olympia.Api.Shared;
using Olympia.Domain.Engine;
using Olympia.Infrastructure.Configuration;
using Olympia.Infrastructure.Data;

namespace Olympia.Api.Modules.Tournaments;

/// <summary>Port of tournaments/routes.ts.</summary>
public static class TournamentRoutes
{
    public static IEndpointRouteBuilder MapTournamentRoutes(this IEndpointRouteBuilder app)
    {
        static async Task<Infrastructure.Data.Entities.UserEntity> Staff(HttpContext http) =>
            await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");

        app.MapPost("/portal/tournaments", async (HttpContext http) =>
        {
            var user = await Staff(http);
            var body = await Validate.ReadJsonBodyAsync(http);
            var service = http.RequestServices.GetRequiredService<TournamentsService>();
            var row = await service.CreateTournamentAsync(user.Id, body);
            http.Response.StatusCode = 201;
            return Results.Json(row, JsonApi.Options);
        });

        app.MapGet("/portal/tournaments", async (HttpContext http) =>
        {
            var user = await Staff(http);
            var query = Validate.Query(http);
            bool? current = query.GetValueOrDefault("current") switch
            {
                "true" => true,
                "false" => false,
                _ => null
            };
            bool? mine = query.GetValueOrDefault("mine") switch
            {
                "true" => true,
                "false" => false,
                _ => null
            };

            var service = http.RequestServices.GetRequiredService<TournamentsService>();
            var page = Pagination.ParsePage(query);
            var rows = await service.ListTournamentsAsync(
                current, mine, user.Id, page, user.Id, user.Role.ToString());
            return Results.Json(rows, JsonApi.Options);
        });

        app.MapGet("/portal/tournaments/{tournamentId}", async (HttpContext http) =>
        {
            var user = await Staff(http);
            var tournamentId = Validate.RouteUuid(http, "tournamentId");
            var service = http.RequestServices.GetRequiredService<TournamentsService>();
            var db = http.RequestServices.GetRequiredService<OlympiaDbContext>();

            var tournament = await service.RequireTournamentAsync(tournamentId);
            if (!TournamentAccess.CanView(tournament, user))
                throw new TournamentError(TournamentErrorCode.NOT_FOUND,
                    $"tournament {tournamentId} not found");

            var places = await db.TournamentPlayers.CountAsync(p => p.TournamentId == tournament.Id);

            var resolved = AocRulebook.ResolveRoundRules(
                tournament.RoundsList, tournament.RoundRulesMap);

            var payload = JsonSerializer
                .SerializeToElement(tournament, JsonDefaults.Options)
                .Deserialize<Dictionary<string, JsonElement>>()!;
            payload["roundRules"] = JsonDefaults.Serialize(resolved);
            payload["places"] = JsonSerializer.SerializeToElement(places);
            return Results.Json(payload, JsonApi.Options);
        });

        app.MapPatch("/portal/tournaments/{tournamentId}", async (HttpContext http) =>
        {
            var user = await Staff(http);
            var tournamentId = Validate.RouteUuid(http, "tournamentId");
            var body = await Validate.ReadJsonBodyAsync(http);
            var service = http.RequestServices.GetRequiredService<TournamentsService>();

            var tournament = await service.RequireTournamentAsync(tournamentId);
            if (!TournamentAccess.CanView(tournament, user))
                throw new TournamentError(TournamentErrorCode.NOT_FOUND,
                    $"tournament {tournamentId} not found");
            if (!TournamentAccess.CanWrite(tournament, user))
                throw ApiException.Forbidden("Only the owner or an admin may manage this tournament");

            var row = await service.UpdateTournamentAsync(tournamentId, body);
            return Results.Json(row, JsonApi.Options);
        });

        app.MapDelete("/portal/tournaments/{tournamentId}", async (HttpContext http) =>
        {
            await http.RequireRoleAsync(Surface.PORTAL, "ADMIN");
            var tournamentId = Validate.RouteUuid(http, "tournamentId");
            var service = http.RequestServices.GetRequiredService<TournamentsService>();
            await service.DeleteTournamentAsync(tournamentId);
            http.Response.StatusCode = 204;
            return Results.Empty;
        });

        return app;
    }
}
