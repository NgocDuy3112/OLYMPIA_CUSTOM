using System.Text.Json;
using AOC.Api.Http;
using AOC.Infrastructure.Configuration;
using AOC.Infrastructure.Data;

namespace AOC.Api.Modules.Matches;

public static class MatchScoringRoutes
{
    public static IEndpointRouteBuilder MapMatchScoringRoutes(this IEndpointRouteBuilder app)
    {
        app.MapPost("/portal/tournaments/{tournamentId}/matches/{matchId}/results", async (HttpContext http) =>
        {
            var tournamentId = Validate.RouteUuid(http, "tournamentId");
            var matchId = Validate.RouteUuid(http, "matchId");
            await MatchEndpoints.RequireAsync(http, tournamentId, matchId, write: true);
            var body = await Validate.ReadJsonBodyAsync(http);
            var scoring = http.RequestServices.GetRequiredService<MatchScoringService>();

            var input = MatchSchemas.ParseSetResults(body);
            var match = await scoring.SetMatchResultsAsync(tournamentId, matchId, input.Totals);

            await AuditAsync(http, "match_results_saved", matchId, new Dictionary<string, object?>
            {
                ["tournamentId"] = tournamentId,
                ["manual"] = true,
                ["totals"] = input.Totals.Select(t => new { userId = t.UserId, score = t.Score }).ToList()
            });

            return Results.Json(match, JsonApi.Options);
        });

        app.MapPatch("/portal/tournaments/{tournamentId}/matches/{matchId}/status", async (HttpContext http) =>
        {
            var tournamentId = Validate.RouteUuid(http, "tournamentId");
            var matchId = Validate.RouteUuid(http, "matchId");
            var routeMatch = await MatchEndpoints.RequireAsync(http, tournamentId, matchId, write: true);
            var body = await Validate.ReadJsonBodyAsync(http);
            var transitions = http.RequestServices.GetRequiredService<MatchTransitionService>();

            var status = MatchSchemas.ParseTransition(body);
            var previous = routeMatch.Scope.Match;
            var match = await transitions.TransitionMatchAsync(tournamentId, matchId, status);

            if (match.Status != previous.Status)
            {
                var hubRegistry = http.RequestServices.GetRequiredService<AOC.Api.Realtime.MatchHubRegistry>();
                await hubRegistry.PublishAsync(matchId);
            }

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

        return app;
    }

    private static Task AuditAsync(HttpContext http, string action, string? matchId,
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
