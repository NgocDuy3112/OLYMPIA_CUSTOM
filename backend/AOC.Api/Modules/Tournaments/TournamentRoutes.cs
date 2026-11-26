using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.RateLimiting;
using AOC.Api.Http;
using AOC.Api.Shared;
using AOC.Domain.Gameplay;
using AOC.Infrastructure.Configuration;
using AOC.Infrastructure.Data;

namespace AOC.Api.Modules.Tournaments;

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
            await Staff(http);
            var tournamentId = Validate.RouteUuid(http, "tournamentId");
            var db = http.RequestServices.GetRequiredService<AOCDbContext>();

            var tournament = await TournamentAccess.RequireViewAsync(http, tournamentId);

            var places = await db.TournamentPlayers.CountAsync(p => p.TournamentId == tournament.Id);
            return Results.Json(TournamentDetail.Of(tournament, places), JsonApi.Options);
        });

        app.MapPatch("/portal/tournaments/{tournamentId}", async (HttpContext http) =>
        {
            await Staff(http);
            var tournamentId = Validate.RouteUuid(http, "tournamentId");
            var body = await Validate.ReadJsonBodyAsync(http);
            var service = http.RequestServices.GetRequiredService<TournamentsService>();

            await TournamentAccess.RequireWriteAsync(http, tournamentId);

            var row = await service.UpdateTournamentAsync(tournamentId, body);
            return Results.Json(row, JsonApi.Options);
        });

        app.MapPost("/portal/tournaments/{tournamentId}/close", async (HttpContext http) =>
        {
            await Staff(http);
            var tournamentId = Validate.RouteUuid(http, "tournamentId");
            var service = http.RequestServices.GetRequiredService<TournamentsService>();

            await TournamentAccess.RequireWriteAsync(http, tournamentId);

            var row = await service.CloseTournamentAsync(tournamentId);
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
