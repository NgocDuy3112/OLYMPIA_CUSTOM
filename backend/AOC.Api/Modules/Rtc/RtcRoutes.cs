using Microsoft.AspNetCore.RateLimiting;
using AOC.Api.Http;
using AOC.Api.Modules.Matches;
using AOC.Api.Shared;
using AOC.Infrastructure.Configuration;
using AOC.Infrastructure.Rtc;

namespace AOC.Api.Modules.Rtc;

public static class RtcRoutes
{
    public static IEndpointRouteBuilder MapRtcRoutes(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/matches/{matchId}/rtc/token", async (HttpContext http) =>
        {
            var user = await http.RequireAuthAsync(Surface.GAMEPLAY);
            var matchId = Validate.RouteUuid(http, "matchId");
            var matches = http.RequestServices.GetRequiredService<Matches.MatchesService>();

            var match = await matches.GetMatchByIdAsync(matchId);
            if (!MatchSeats.IsSeatedInMatch(match.PlayersList, user.Id))
                throw ApiException.Forbidden("you are not a player in this match");

            return Results.Json(MintFor(matchId, RtcRole.Player, user.Id, user.DisplayName), JsonApi.Options);
        });

        app.MapPost("/portal/tournaments/{tournamentId}/matches/{matchId}/rtc/token", async (HttpContext http) =>
        {
            var user = await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
            var matchId = Validate.RouteUuid(http, "matchId");
            var matches = http.RequestServices.GetRequiredService<Matches.MatchesService>();

            var match = await matches.GetMatchByIdAsync(matchId);
            return Results.Json(MintFor(matchId, RtcRole.Operator, user.Id, user.DisplayName), JsonApi.Options);
        });

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
