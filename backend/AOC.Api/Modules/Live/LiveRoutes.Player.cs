using System.Text.Json;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using AOC.Api.Http;
using AOC.Api.Modules.Matches;
using AOC.Api.Shared;
using AOC.Domain.Contracts;
using AOC.Domain.Gameplay;
using AOC.Infrastructure.Configuration;
using AOC.Infrastructure.Data;

namespace AOC.Api.Modules.Live;

public static partial class LiveRoutes
{
    private static void MapPlayerRoutes(IEndpointRouteBuilder app)
    {
        app.MapGet("/api/matches/{matchId}/live", async (HttpContext http) =>
        {
            var user = await http.RequireAuthAsync(Surface.GAMEPLAY);
            var matchId = Validate.RouteUuid(http, "matchId");

            var matches = http.RequestServices.GetRequiredService<MatchesService>();
            var match = await matches.GetMatchByIdAsync(matchId);
            if (match.Status != MatchStatus.LIVE)
                throw ApiException.Conflict("match is not LIVE");
            if (!MatchSeats.IsSeatedInMatch(match.PlayersList, user.Id))
                throw ApiException.Forbidden("you are not a player in this match");

            var reader = http.RequestServices.GetRequiredService<LiveReader>();
            if (await reader.ReadLiveAsync(Guid.Parse(matchId)) is null)
                throw ApiException.NotFound("no live round");

            var service = http.RequestServices.GetRequiredService<LiveService>();
            return Results.Json(
                await service.PlayerViewOfAsync(Guid.Parse(matchId), user.Id), JsonApi.Options);
        });

        app.MapGet("/api/matches/{matchId}/lobby", async (HttpContext http) =>
        {
            var user = await http.RequireAuthAsync(Surface.GAMEPLAY);
            var matchId = Validate.RouteUuid(http, "matchId");

            var matches = http.RequestServices.GetRequiredService<MatchesService>();
            var match = await matches.GetMatchByIdAsync(matchId);
            if (!MatchSeats.IsSeatedInMatch(match.PlayersList, user.Id))
                throw ApiException.Forbidden("you are not a player in this match");

            var service = http.RequestServices.GetRequiredService<LiveService>();
            return Results.Json(await service.LobbyOfAsync(Guid.Parse(matchId)), JsonApi.Options);
        });

        app.MapPost("/api/matches/{matchId}/live/answers", async (HttpContext http) =>
        {
            var user = await http.RequireAuthAsync(Surface.GAMEPLAY);
            var matchId = Validate.RouteUuid(http, "matchId");
            var body = Validate.Object(await Validate.ReadJsonBodyAsync(http));
            var questionId = Validate.RequiredUuid(body, "questionId");
            if (!body.TryGetProperty("value", out var value))
                throw ApiException.BadRequest("body must have required property 'value'");

            var pressedAt = SubmitService.ReadPressedAt(body);

            var submit = http.RequestServices.GetRequiredService<SubmitService>();
            var result = await submit.SubmitAnswerAsync(new SubmitService.SubmitContext(
                Guid.Parse(matchId), user.Id, Guid.Parse(questionId), value.Clone(),
                http.Connection.RemoteIpAddress?.ToString(),
                http.Request.Headers.UserAgent.ToString(),
                pressedAt));
            return Results.Json(result, JsonApi.Options);
        }).RequireRateLimiting("live30");

        app.MapPost("/api/matches/{matchId}/live/commands", async (HttpContext http) =>
        {
            var user = await http.RequireAuthAsync(Surface.GAMEPLAY);
            var matchId = Validate.RouteUuid(http, "matchId");
            var body = Validate.Object(await Validate.ReadJsonBodyAsync(http));
            var type = Validate.RequiredString(body, "type");

            if (type == "buzz")
            {
                var questionId = Validate.RequiredUuid(body, "questionId");
                var submit = http.RequestServices.GetRequiredService<SubmitService>();
                var result = await submit.SubmitVeDichCommandAsync(
                    Guid.Parse(matchId), user.Id, "buzz");
                return Results.Json(result, JsonApi.Options);
            }

            throw ApiException.BadRequest("unknown command");
        }).RequireRateLimiting("live30");

        app.MapPost("/api/matches/{matchId}/live/keyword", async (HttpContext http) =>
        {
            var user = await http.RequireAuthAsync(Surface.GAMEPLAY);
            var matchId = Validate.RouteUuid(http, "matchId");
            var body = Validate.Object(await Validate.ReadJsonBodyAsync(http));
            var questionId = Validate.RequiredUuid(body, "questionId");
            if (!body.TryGetProperty("value", out var value))
                throw ApiException.BadRequest("body must have required property 'value'");

            var submit = http.RequestServices.GetRequiredService<SubmitService>();
            var result = await submit.SubmitKeywordAsync(new SubmitService.SubmitContext(
                Guid.Parse(matchId), user.Id, Guid.Parse(questionId), value.Clone(),
                http.Connection.RemoteIpAddress?.ToString(),
                http.Request.Headers.UserAgent.ToString(),
                SubmitService.ReadPressedAt(body)));
            return Results.Json(result, JsonApi.Options);
        }).RequireRateLimiting("live30");
    }
}
