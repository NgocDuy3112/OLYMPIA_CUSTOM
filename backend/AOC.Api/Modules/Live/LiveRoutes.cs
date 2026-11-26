using System.Text.Json;
using AOC.Api.Http;
using AOC.Api.Modules.Matches;
using AOC.Api.Realtime;
using AOC.Api.Shared;
using AOC.Domain.Contracts;
using AOC.Infrastructure.Audit;
using AOC.Infrastructure.Configuration;

namespace AOC.Api.Modules.Live;

public static partial class LiveRoutes
{
    public static IEndpointRouteBuilder MapLiveRoutes(this IEndpointRouteBuilder app)
    {
        MapPortalRoutes(app);
        MapPlayerRoutes(app);
        return app;
    }

    private static void MapPortalRoutes(IEndpointRouteBuilder app)
    {
        app.MapPost("/portal/tournaments/{tournamentId}/matches/{matchId}/live/actions", async (HttpContext http) =>
        {
            var user = await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
            var tournamentId = Validate.RouteUuid(http, "tournamentId");
            var matchId = Validate.RouteUuid(http, "matchId");
            var body = Validate.Object(await Validate.ReadJsonBodyAsync(http));

            var expectedVersion = body.TryGetProperty("expectedVersion", out var expectedEl)
                && expectedEl.ValueKind == JsonValueKind.Number
                ? expectedEl.GetInt32()
                : -1;
            if (!body.TryGetProperty("action", out var actionEl) || actionEl.ValueKind != JsonValueKind.Object)
                throw ApiException.BadRequest("invalid live action");

            LiveAction action;
            try
            {
                action = actionEl.Deserialize<LiveAction>(JsonApi.Options)!;
            }
            catch (JsonException)
            {
                throw ApiException.BadRequest("invalid live action");
            }

            var matchScope = await TournamentAccess.RequireMatchAsync(http, tournamentId, matchId, write: true);

            var next = await LiveActionRun.ApplyAsync(http,
                http.RequestServices.GetRequiredService<LiveService>(),
                http.RequestServices.GetRequiredService<MatchHubRegistry>(),
                http.RequestServices.GetRequiredService<AuditService>(),
                matchScope.Match, user.Id, Guid.Parse(tournamentId), Guid.Parse(matchId),
                expectedVersion, action);

            return Results.Json(new
            {
                version = next.Version,
                roundId = next.RoundId,
                state = next.State,
                archive = next.Archive
            }, JsonApi.Options);
        });

        app.MapPost("/portal/tournaments/{tournamentId}/matches/{matchId}/live/control", async (HttpContext http) =>
        {
            var user = await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
            var tournamentId = Validate.RouteUuid(http, "tournamentId");
            var matchId = Validate.RouteUuid(http, "matchId");
            var body = Validate.Object(await Validate.ReadJsonBodyAsync(http));
            var takeover = body.TryGetProperty("takeover", out var takeoverEl) &&
                takeoverEl.ValueKind == JsonValueKind.True;

            var matchScope = await TournamentAccess.RequireMatchAsync(http, tournamentId, matchId, write: true);

            var service = http.RequestServices.GetRequiredService<LiveService>();
            var before = await service.ControllerOfAsync(Guid.Parse(matchId));
            var controller = await service.ClaimControlAsync(matchScope.Match, user.Id, takeover);

            if (before?.Id != controller.Id)
            {
                var hubRegistry = http.RequestServices.GetRequiredService<MatchHubRegistry>();
                await hubRegistry.PublishAsync(matchId);
            }
            return Results.Json(controller, JsonApi.Options);
        });

        app.MapPost("/portal/tournaments/{tournamentId}/matches/{matchId}/live/heartbeat", async (HttpContext http) =>
        {
            var user = await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
            var tournamentId = Validate.RouteUuid(http, "tournamentId");
            var matchId = Validate.RouteUuid(http, "matchId");
            await LiveMatchGuard.RequirePortalWriteAsync(http, tournamentId, matchId, user);
            var service = http.RequestServices.GetRequiredService<LiveService>();
            return Results.Json(await service.HeartbeatAsync(Guid.Parse(matchId), user.Id),
                JsonApi.Options);
        });

        app.MapGet("/portal/tournaments/{tournamentId}/matches/{matchId}/live", async (HttpContext http) =>
        {
            var user = await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
            var tournamentId = Validate.RouteUuid(http, "tournamentId");
            var matchId = Validate.RouteUuid(http, "matchId");
            await LiveMatchGuard.RequirePortalWriteAsync(http, tournamentId, matchId, user);
            var service = http.RequestServices.GetRequiredService<LiveService>();
            var payload = await service.ConsoleViewOfAsync(Guid.Parse(matchId));
            if (payload is null) throw ApiException.NotFound("no live round");
            return Results.Json(payload, JsonApi.Options);
        });

        app.MapGet("/spectate/tournaments/{tournamentId}/matches/{matchId}/live", async (HttpContext http) =>
        {
            var tournamentId = Validate.RouteUuid(http, "tournamentId");
            var matchId = Validate.RouteUuid(http, "matchId");
            await LiveMatchGuard.RequireSpectatableAsync(http, tournamentId, matchId);
            var service = http.RequestServices.GetRequiredService<LiveService>();
            var payload = await service.AudienceViewOfAsync(Guid.Parse(matchId));
            if (payload is null) throw ApiException.NotFound("no live round");
            return Results.Json(payload, JsonApi.Options);
        }).RequireRateLimiting("public60");

        app.MapGet("/portal/tournaments/{tournamentId}/matches/{matchId}/lobby", async (HttpContext http) =>
        {
            var user = await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
            var tournamentId = Validate.RouteUuid(http, "tournamentId");
            var matchId = Validate.RouteUuid(http, "matchId");
            await LiveMatchGuard.RequirePortalAsync(http, tournamentId, matchId, user);
            var service = http.RequestServices.GetRequiredService<LiveService>();
            return Results.Json(await service.LobbyOfAsync(Guid.Parse(matchId)), JsonApi.Options);
        });
    }
}
