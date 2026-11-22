using System.Text.Json;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using AOC.Api.Http;
using AOC.Api.Modules.Matches;
using AOC.Api.Realtime;
using AOC.Domain.Contracts;
using AOC.Domain.Gameplay;
using AOC.Infrastructure.Configuration;
using AOC.Infrastructure.Data;

namespace AOC.Api.Modules.Live;

public static class LiveRoutes
{
    public static IEndpointRouteBuilder MapLiveRoutes(this IEndpointRouteBuilder app)
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

            var scope = http.RequestServices.GetRequiredService<MatchesService>();
            var tournament = await scope.RequireMatchScopeAsync(tournamentId);
            if (!Shared.TournamentAccess.CanWrite(tournament.Tournament, user))
                throw ApiException.Forbidden("Only the owner or an admin may drive a live match");

            var service = http.RequestServices.GetRequiredService<LiveService>();
            await service.RequireControllerAsync(Guid.Parse(matchId), user.Id);
            var next = await service.ApplyLiveActionAsync(
                Guid.Parse(tournamentId), Guid.Parse(matchId), expectedVersion, action, user.Id);

            var hubRegistry = http.RequestServices.GetRequiredService<MatchHubRegistry>();
            await hubRegistry.PublishAsync(matchId);

            var audit = http.RequestServices.GetRequiredService<AOC.Infrastructure.Audit.AuditService>();
            if (action is LiveAction.KhoiDongJudge judge)
            {
                await audit.AuditAsync(new AOC.Infrastructure.Audit.AuditEvent
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
            if (action is LiveAction.VeDichJudge vdJudge)
            {
                await audit.AuditAsync(new AOC.Infrastructure.Audit.AuditEvent
                {
                    Action = "answer_judged",
                    ActorId = user.Id,
                    MatchId = Guid.Parse(matchId),
                    Ip = http.Connection.RemoteIpAddress?.ToString(),
                    UserAgent = http.Request.Headers.UserAgent.ToString(),
                    Details = new Dictionary<string, object?>
                    {
                        ["roundId"] = next.RoundId,
                        ["playerId"] = vdJudge.PlayerId,
                        ["correct"] = vdJudge.Correct
                    }
                });
            }
            if (action is LiveAction.VeDichResolve vdResolve)
            {
                await audit.AuditAsync(new AOC.Infrastructure.Audit.AuditEvent
                {
                    Action = "ve_dich_resolved",
                    ActorId = user.Id,
                    MatchId = Guid.Parse(matchId),
                    Ip = http.Connection.RemoteIpAddress?.ToString(),
                    UserAgent = http.Request.Headers.UserAgent.ToString(),
                    Details = new Dictionary<string, object?>
                    {
                        ["roundId"] = next.RoundId,
                        ["answerer"] = vdResolve.Answerer,
                        ["buzzer"] = vdResolve.Buzzer
                    }
                });
            }
            if (action is LiveAction.RevealAnswer reveal)
            {
                await audit.AuditAsync(new AOC.Infrastructure.Audit.AuditEvent
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
                await audit.AuditAsync(new AOC.Infrastructure.Audit.AuditEvent
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
            if (action is LiveAction.Regrade regrade)
            {
                await audit.AuditAsync(new AOC.Infrastructure.Audit.AuditEvent
                {
                    Action = "answer_regraded",
                    ActorId = user.Id,
                    MatchId = Guid.Parse(matchId),
                    Ip = http.Connection.RemoteIpAddress?.ToString(),
                    UserAgent = http.Request.Headers.UserAgent.ToString(),
                    Details = new Dictionary<string, object?>
                    {
                        ["roundId"] = next.RoundId,
                        ["questionId"] = regrade.QuestionId,
                        ["playerId"] = regrade.PlayerId,
                        ["delta"] = regrade.Delta
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

        app.MapPost("/portal/tournaments/{tournamentId}/matches/{matchId}/live/control", async (HttpContext http) =>
        {
            var user = await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
            var tournamentId = Validate.RouteUuid(http, "tournamentId");
            var matchId = Validate.RouteUuid(http, "matchId");
            var body = Validate.Object(await Validate.ReadJsonBodyAsync(http));
            var takeover = body.TryGetProperty("takeover", out var takeoverEl) &&
                takeoverEl.ValueKind == JsonValueKind.True;

            var scope = http.RequestServices.GetRequiredService<MatchesService>();
            var tournament = await scope.RequireMatchScopeAsync(tournamentId);
            if (!Shared.TournamentAccess.CanWrite(tournament.Tournament, user))
                throw ApiException.Forbidden("Only the owner or an admin may drive a live match");

            var service = http.RequestServices.GetRequiredService<LiveService>();
            var before = await service.ControllerOfAsync(Guid.Parse(matchId));
            var controller = await service.ClaimControlAsync(Guid.Parse(matchId), user.Id, takeover);

            if (before?.Id != controller.Id)
            {
                var hubRegistry = http.RequestServices.GetRequiredService<MatchHubRegistry>();
                await hubRegistry.PublishAsync(matchId);
            }
            return Results.Json(controller, JsonApi.Options);
        });

        app.MapGet("/portal/tournaments/{tournamentId}/matches/{matchId}/live", async (HttpContext http) =>
        {
            await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
            var matchId = Validate.RouteUuid(http, "matchId");
            var service = http.RequestServices.GetRequiredService<LiveService>();
            var payload = await service.ConsoleViewOfAsync(Guid.Parse(matchId));
            if (payload is null) throw ApiException.NotFound("no live round");
            return Results.Json(payload, JsonApi.Options);
        });

        app.MapGet("/spectate/tournaments/{tournamentId}/matches/{matchId}/live", async (HttpContext http) =>
        {
            var matchId = Validate.RouteUuid(http, "matchId");
            var service = http.RequestServices.GetRequiredService<LiveService>();
            var payload = await service.AudienceViewOfAsync(Guid.Parse(matchId));
            if (payload is null) throw ApiException.NotFound("no live round");
            return Results.Json(payload, JsonApi.Options);
        }).RequireRateLimiting("public60");

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

            DateTimeOffset? pressedAt = null;
            if (body.TryGetProperty("pressedAt", out var pressedEl)
                && pressedEl.ValueKind == JsonValueKind.String
                && DateTimeOffset.TryParse(pressedEl.GetString(), out var parsedPressed))
                pressedAt = parsedPressed;

            var submit = http.RequestServices.GetRequiredService<SubmitService>();
            var result = await submit.SubmitAnswerAsync(new SubmitService.SubmitContext(
                Guid.Parse(matchId), user.Id, Guid.Parse(questionId), value.Clone(),
                http.Connection.RemoteIpAddress?.ToString(),
                http.Request.Headers.UserAgent.ToString(),
                pressedAt));
            return Results.Json(result, JsonApi.Options);
        });

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
        });

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
                http.Request.Headers.UserAgent.ToString()));
            return Results.Json(result, JsonApi.Options);
        });

        return app;
    }
}
