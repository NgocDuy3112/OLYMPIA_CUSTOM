using AOC.Api.Http;
using AOC.Api.Modules.Matches;
using AOC.Api.Shared;
using AOC.Infrastructure.Audit;
using AOC.Infrastructure.Configuration;

namespace AOC.Api.Modules.Live.TieBreak;

public static class TieBreakRoutes
{
    public static IEndpointRouteBuilder MapTieBreakRoutes(this IEndpointRouteBuilder app)
    {
        app.MapPost("/portal/tournaments/{tournamentId}/matches/{matchId}/live/tiebreak", async (HttpContext http) =>
        {
            var user = await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
            var tournamentId = Validate.RouteUuid(http, "tournamentId");
            var matchId = Validate.RouteUuid(http, "matchId");
            var body = Validate.Object(await Validate.ReadJsonBodyAsync(http));
            var action = TieBreakSchemas.Parse(body);
            var expectedVersion = TieBreakSchemas.ExpectedVersion(body);

            var matches = http.RequestServices.GetRequiredService<MatchesService>();
            var tournament = await matches.RequireMatchScopeAsync(tournamentId);
            if (!TournamentAccess.CanWrite(tournament.Tournament, user))
                throw ApiException.Forbidden("Only the owner or an admin may drive a live match");

            var live = http.RequestServices.GetRequiredService<LiveService>();
            await live.RequireControllerAsync(Guid.Parse(matchId), user.Id);

            var service = http.RequestServices.GetRequiredService<TieBreakService>();
            var state = action switch
            {
                TieBreakAction.Start start => await service.StartAsync(
                    Guid.Parse(matchId), start.PlayerIds, expectedVersion),
                TieBreakAction.OpenBuzz => await service.OpenBuzzAsync(Guid.Parse(matchId), expectedVersion),
                TieBreakAction.LockBuzz => await service.LockBuzzAsync(Guid.Parse(matchId), expectedVersion),
                TieBreakAction.Judge judge => await service.JudgeAsync(
                    Guid.Parse(matchId), judge.Correct, expectedVersion),
                TieBreakAction.Advance => await service.AdvanceAsync(Guid.Parse(matchId), expectedVersion),
                TieBreakAction.End => await service.EndAsync(Guid.Parse(matchId), expectedVersion),
                _ => throw ApiException.BadRequest("unknown tie-break action")
            };

            var view = await service.ViewAsync(Guid.Parse(matchId), null)
                ?? throw new LiveNotFoundError(matchId);

            var audit = http.RequestServices.GetRequiredService<AuditService>();
            var (auditAction, details) = AuditOf(action, state, tournamentId);
            await audit.AuditAsync(new AuditEvent
            {
                Action = auditAction,
                ActorId = user.Id,
                MatchId = Guid.Parse(matchId),
                Ip = http.Connection.RemoteIpAddress?.ToString(),
                UserAgent = http.Request.Headers.UserAgent.ToString(),
                Details = details
            });

            return Results.Json(view, JsonApi.Options);
        });

        app.MapGet("/portal/tournaments/{tournamentId}/matches/{matchId}/live/tiebreak", async (HttpContext http) =>
        {
            var user = await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
            var tournamentId = Validate.RouteUuid(http, "tournamentId");
            var matchId = Validate.RouteUuid(http, "matchId");
            await LiveMatchGuard.RequirePortalAsync(http, tournamentId, matchId, user);
            var service = http.RequestServices.GetRequiredService<TieBreakService>();
            var view = await service.ViewAsync(Guid.Parse(matchId), null);
            if (view is null) throw ApiException.NotFound("no tie-break is running");
            return Results.Json(view, JsonApi.Options);
        });

        app.MapGet("/api/matches/{matchId}/live/tiebreak", async (HttpContext http) =>
        {
            var user = await http.RequireAuthAsync(Surface.GAMEPLAY);
            var matchId = Validate.RouteUuid(http, "matchId");

            var matches = http.RequestServices.GetRequiredService<MatchesService>();
            var match = await matches.GetMatchByIdAsync(matchId);
            if (!MatchSeats.IsSeatedInMatch(match.PlayersList, user.Id))
                throw ApiException.Forbidden("you are not a player in this match");

            var service = http.RequestServices.GetRequiredService<TieBreakService>();
            var view = await service.ViewAsync(Guid.Parse(matchId), user.Id);
            if (view is null) throw ApiException.NotFound("no tie-break is running");
            return Results.Json(view, JsonApi.Options);
        });

        return app;
    }

    private static (string Action, Dictionary<string, object?> Details) AuditOf(
        TieBreakAction action, AOC.Domain.Gameplay.Turns.TieBreakState state, string tournamentId)
    {
        var common = new Dictionary<string, object?>
        {
            ["tournamentId"] = tournamentId,
            ["cursor"] = state.Cursor,
            ["buzzer"] = state.Window.Buzzer
        };
        return action switch
        {
            TieBreakAction.Start start => ("tiebreak_started", With(common, "players", start.PlayerIds)),
            TieBreakAction.OpenBuzz => ("tiebreak_opened", common),
            TieBreakAction.LockBuzz => ("tiebreak_locked", common),
            TieBreakAction.Judge judge => ("tiebreak_judged", With(common, "correct", judge.Correct)),
            TieBreakAction.Advance => ("tiebreak_advanced", common),
            _ => ("tiebreak_ended", common)
        };
    }

    private static Dictionary<string, object?> With(
        Dictionary<string, object?> source, string key, object? value)
    {
        var copy = new Dictionary<string, object?>(source) { [key] = value };
        return copy;
    }
}
