using System.Text.Json;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Olympia.Api.Http;
using Olympia.Api.Modules.Matches;
using Olympia.Api.Realtime;
using Olympia.Domain.Contracts;
using Olympia.Domain.Engine;
using Olympia.Infrastructure.Configuration;
using Olympia.Infrastructure.Data;

namespace Olympia.Api.Modules.Live;

/// <summary>Port of live/routes.ts HTTP endpoints (the WS parts live in the hubs).</summary>
public static class LiveRoutes
{
    public static IEndpointRouteBuilder MapLiveRoutes(this IEndpointRouteBuilder app)
    {
        // POST /portal/tournaments/:tournamentId/matches/:matchId/live/actions
        app.MapPost("/portal/tournaments/{tournamentId}/matches/{matchId}/live/actions", async (HttpContext http) =>
        {
            var user = await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
            var tournamentId = Validate.RouteUuid(http, "tournamentId");
            var matchId = Validate.RouteUuid(http, "matchId");
            var body = Validate.Object(await Validate.ReadJsonBodyAsync(http));

            var expectedVersion = Validate.RequiredInt(body, "expectedVersion", min: 0);
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

            var scope = http.RequestServices.GetRequiredService<MatchesService>();
            var tournament = await scope.RequireMatchScopeAsync(tournamentId);
            if (!Shared.TournamentAccess.CanWrite(tournament.Tournament, user))
                throw ApiException.Forbidden("Only the owner or an admin may drive a live match");

            var service = http.RequestServices.GetRequiredService<LiveService>();
            var next = await service.ApplyLiveActionAsync(
                Guid.Parse(tournamentId), Guid.Parse(matchId), expectedVersion, action, user.Id);

            var hubRegistry = http.RequestServices.GetRequiredService<MatchHubRegistry>();
            await hubRegistry.PublishAsync(matchId);

            var audit = http.RequestServices.GetRequiredService<Olympia.Infrastructure.Audit.AuditService>();
            if (action is LiveAction.KhoiDongJudge judge)
            {
                await audit.AuditAsync(new Olympia.Infrastructure.Audit.AuditEvent
                {
                    Action = "answer_judged",
                    ActorId = user.Id,
                    MatchId = Guid.Parse(matchId),
                    Ip = http.Connection.RemoteIpAddress?.ToString(),
                    UserAgent = http.Request.Headers.UserAgent.ToString(),
                    Details = new Dictionary<string, object?>
                    {
                        ["roundId"] = next.RoundId,
                        ["playerId"] = judge.PlayerId,
                        ["correct"] = judge.Correct
                    }
                });
            }
            if (action is LiveAction.RevealAnswer reveal)
            {
                await audit.AuditAsync(new Olympia.Infrastructure.Audit.AuditEvent
                {
                    Action = "answer_revealed",
                    ActorId = user.Id,
                    MatchId = Guid.Parse(matchId),
                    Ip = http.Connection.RemoteIpAddress?.ToString(),
                    UserAgent = http.Request.Headers.UserAgent.ToString(),
                    Details = new Dictionary<string, object?>
                    {
                        ["roundId"] = next.RoundId,
                        ["questionId"] = reveal.QuestionId
                    }
                });
            }
            if (action is LiveAction.ScoreAdjust scoreAdjust)
            {
                await audit.AuditAsync(new Olympia.Infrastructure.Audit.AuditEvent
                {
                    Action = "score_adjusted",
                    ActorId = user.Id,
                    MatchId = Guid.Parse(matchId),
                    Ip = http.Connection.RemoteIpAddress?.ToString(),
                    UserAgent = http.Request.Headers.UserAgent.ToString(),
                    Details = new Dictionary<string, object?>
                    {
                        ["userId"] = scoreAdjust.UserId,
                        ["delta"] = scoreAdjust.Delta,
                        ["reason"] = scoreAdjust.Reason
                    }
                });
            }

            return Results.Json(new
            {
                version = next.Version,
                roundId = next.RoundId,
                state = next.State,
                archive = next.Archive
            }, JsonApi.Options);
        });

        // GET /portal/.../live/answers?questionId=
        app.MapGet("/portal/tournaments/{tournamentId}/matches/{matchId}/live/answers", async (HttpContext http) =>
        {
            await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
            var matchId = Validate.RouteUuid(http, "matchId");
            var query = Validate.Query(http);
            if (query.GetValueOrDefault("questionId") is not { } questionIdRaw
                || !Guid.TryParse(questionIdRaw, out var questionId))
                throw ApiException.BadRequest("questionId must be a uuid");

            var reader = http.RequestServices.GetRequiredService<LiveReader>();
            var items = await reader.ReadQuestionAnswersAsync(Guid.Parse(matchId), questionId);
            return Results.Json(new { items }, JsonApi.Options);
        }).RequireRateLimiting("public60");

        // GET /portal/.../live  (console view)
        app.MapGet("/portal/tournaments/{tournamentId}/matches/{matchId}/live", async (HttpContext http) =>
        {
            await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
            var matchId = Validate.RouteUuid(http, "matchId");
            var service = http.RequestServices.GetRequiredService<LiveService>();
            var payload = await service.ConsoleViewOfAsync(Guid.Parse(matchId));
            if (payload is null) throw ApiException.NotFound("no live round");
            return Results.Json(payload, JsonApi.Options);
        });

        // GET /spectate/.../live  (audience view)
        app.MapGet("/spectate/tournaments/{tournamentId}/matches/{matchId}/live", async (HttpContext http) =>
        {
            var matchId = Validate.RouteUuid(http, "matchId");
            var service = http.RequestServices.GetRequiredService<LiveService>();
            var payload = await service.AudienceViewOfAsync(Guid.Parse(matchId));
            if (payload is null) throw ApiException.NotFound("no live round");
            return Results.Json(payload, JsonApi.Options);
        }).RequireRateLimiting("public60");

        // GET /portal/.../lobby  +  /spectate/.../lobby
        app.MapGet("/portal/tournaments/{tournamentId}/matches/{matchId}/lobby", async (HttpContext http) =>
        {
            await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
            var matchId = Validate.RouteUuid(http, "matchId");
            var service = http.RequestServices.GetRequiredService<LiveService>();
            return Results.Json(await service.LobbyOfAsync(Guid.Parse(matchId)), JsonApi.Options);
        });

        app.MapGet("/spectate/tournaments/{tournamentId}/matches/{matchId}/lobby", async (HttpContext http) =>
        {
            var matchId = Validate.RouteUuid(http, "matchId");
            var service = http.RequestServices.GetRequiredService<LiveService>();
            return Results.Json(await service.LobbyOfAsync(Guid.Parse(matchId)), JsonApi.Options);
        }).RequireRateLimiting("public60");

        // GET /gameplay/matches/:matchId/live
        app.MapGet("/gameplay/matches/{matchId}/live", async (HttpContext http) =>
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

        // GET /gameplay/matches/:matchId/lobby
        app.MapGet("/gameplay/matches/{matchId}/lobby", async (HttpContext http) =>
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

        // POST /gameplay/matches/:matchId/live/answers
        app.MapPost("/gameplay/matches/{matchId}/live/answers", async (HttpContext http) =>
        {
            var user = await http.RequireAuthAsync(Surface.GAMEPLAY);
            var matchId = Validate.RouteUuid(http, "matchId");
            var body = Validate.Object(await Validate.ReadJsonBodyAsync(http));
            var questionId = Validate.RequiredUuid(body, "questionId");
            if (!body.TryGetProperty("value", out var value))
                throw ApiException.BadRequest("body must have required property 'value'");

            var submit = http.RequestServices.GetRequiredService<SubmitService>();
            var result = await submit.SubmitAnswerAsync(new SubmitService.SubmitContext(
                Guid.Parse(matchId), user.Id, Guid.Parse(questionId), value.Clone(),
                http.Connection.RemoteIpAddress?.ToString(),
                http.Request.Headers.UserAgent.ToString()));
            return Results.Json(result, JsonApi.Options);
        });

        // POST /gameplay/matches/:matchId/live/commands  (buzz)
        app.MapPost("/gameplay/matches/{matchId}/live/commands", async (HttpContext http) =>
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
        });

        // POST /gameplay/matches/:matchId/live/keyword
        app.MapPost("/gameplay/matches/{matchId}/live/keyword", async (HttpContext http) =>
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
                http.Request.Headers.UserAgent.ToString()));
            return Results.Json(result, JsonApi.Options);
        });

        return app;
    }
}
