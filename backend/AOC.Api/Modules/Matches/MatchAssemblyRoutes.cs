using System.Text.Json;
using AOC.Api.Http;
using AOC.Infrastructure.Configuration;

namespace AOC.Api.Modules.Matches;

public static class MatchAssemblyRoutes
{
    public static IEndpointRouteBuilder MapMatchAssemblyRoutes(this IEndpointRouteBuilder app)
    {
        app.MapPatch("/portal/tournaments/{tournamentId}/matches/{matchId}/assemble", async (HttpContext http) =>
        {
            var tournamentId = Validate.RouteUuid(http, "tournamentId");
            var matchId = Validate.RouteUuid(http, "matchId");
            var match = await MatchEndpoints.RequireAsync(http, tournamentId, matchId, write: true);
            var body = await Validate.ReadJsonBodyAsync(http);
            var assembly = http.RequestServices.GetRequiredService<AssemblePatchService>();

            var input = MatchSchemas.ParsePatchAssemble(body);
            var result = await assembly.PatchAssembleAsync(tournamentId, matchId, input, match.User.Id);
            return Results.Json(new { assemblyRevision = result.AssemblyRevision }, JsonApi.Options);
        });

        return app;
    }
}
