using System.Text.Json;
using AOC.Api.Http;
using AOC.Api.Shared;
using AOC.Infrastructure.Audit;
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

            var audit = http.RequestServices.GetRequiredService<AuditService>();
            await audit.AuditAsync(http, AuditTarget.Match(matchId), "match_results_saved",
                new MatchResultsSavedAudit(tournamentId, Manual: true,
                    input.Totals.Select(t => new MatchTotalAudit(t.UserId, t.Score)).ToList()));

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
            var previous = routeMatch.Scope.Match.Status;
            var match = await transitions.TransitionMatchAsync(tournamentId, matchId, status);

            await MatchStatusChange.NotifyAsync(http,
                http.RequestServices.GetRequiredService<AOC.Api.Realtime.MatchHubRegistry>(),
                http.RequestServices.GetRequiredService<AuditService>(),
                routeMatch.User.Id, routeMatch.Scope.Match.TournamentId, matchId, previous, match);

            return Results.Json(match, JsonApi.Options);
        });

        return app;
    }

    private sealed record MatchResultsSavedAudit(
        string TournamentId, bool Manual, List<MatchTotalAudit> Totals);

    private sealed record MatchTotalAudit(string UserId, int Score);
}
