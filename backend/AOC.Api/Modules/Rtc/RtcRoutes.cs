using Microsoft.AspNetCore.RateLimiting;
using AOC.Api.Http;
using AOC.Api.Modules.Matches;
using AOC.Api.Shared;
using AOC.Infrastructure.Configuration;
using AOC.Infrastructure.Rtc;

namespace AOC.Api.Modules.Rtc;

/// <summary>Port of rtc/routes.ts — LiveKit token minting.</summary>
public static class RtcRoutes
{
    public static IEndpointRouteBuilder MapRtcRoutes(this IEndpointRouteBuilder app)
    {
        // POST /gameplay/matches/:matchId/rtc/token  (player)
        app.MapPost("/gameplay/matches/{matchId}/rtc/token", async (HttpContext http) =>
        {
            var user = await http.RequireAuthAsync(Surface.GAMEPLAY);
            var matchId = Validate.RouteUuid(http, "matchId");
            var matches = http.RequestServices.GetRequiredService<Matches.MatchesService>();

            var match = await matches.GetMatchByIdAsync(matchId);
            if (!MatchSeats.IsSeatedInMatch(match.PlayersList, user.Id))
                throw ApiException.Forbidden("you are not a player in this match");

            return Results.Json(MintFor(matchId, RtcRole.Player, user.Id, user.DisplayName), JsonApi.Options);
        });

        // POST /portal/tournaments/:tournamentId/matches/:matchId/rtc/token  (operator)
        app.MapPost("/portal/tournaments/{tournamentId}/matches/{matchId}/rtc/token", async (HttpContext http) =>
        {
            var user = await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
            var matchId = Validate.RouteUuid(http, "matchId");
            var matches = http.RequestServices.GetRequiredService<Matches.MatchesService>();

            var match = await matches.GetMatchByIdAsync(matchId);
            return Results.Json(MintFor(matchId, RtcRole.Operator, user.Id, user.DisplayName), JsonApi.Options);
        });

        // POST /gameplay/matches/:matchId/rtc/viewer-token  (spectator, rate-limited)
        app.MapPost("/gameplay/matches/{matchId}/rtc/viewer-token", async (HttpContext http) =>
        {
            var matchId = Validate.RouteUuid(http, "matchId");
            var matches = http.RequestServices.GetRequiredService<Matches.MatchesService>();
            await matches.GetMatchByIdAsync(matchId);
            return Results.Json(MintFor(matchId, RtcRole.Spectator), JsonApi.Options);
        }).RequireRateLimiting("viewer20");

        return app;
    }

    private static object MintFor(string matchId, RtcRole role, Guid? userId = null, string? name = null)
    {
        if (!RtcTokens.IsConfigured())
            throw ApiException.Unavailable("rtc is not configured");
        var token = RtcTokens.Mint(role, matchId, userId?.ToString(), name);
        return new { room = matchId, url = token.Url, token = token.Token, identity = token.Identity, expiresIn = token.ExpiresIn };
    }
}
