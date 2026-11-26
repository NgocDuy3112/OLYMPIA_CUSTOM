using System.Text.RegularExpressions;
using Microsoft.AspNetCore.RateLimiting;
using AOC.Api.Http;
using AOC.Infrastructure.Configuration;

namespace AOC.Api.Modules.GameplayRead;

public static class GameplayReadRoutes
{
    public static IEndpointRouteBuilder MapGameplayReadRoutes(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/tournaments", async (HttpContext http) =>
        {
            var service = http.RequestServices.GetRequiredService<GameplayReadService>();
            return Results.Json(new { tournaments = await service.ListPublicTournamentsAsync() },
                JsonApi.Options);
        }).RequireRateLimiting("public120");

        app.MapGet("/api/tournaments/{slug}", async (HttpContext http) =>
        {
            var slug = SlugOf(http);
            var service = http.RequestServices.GetRequiredService<GameplayReadService>();
            return Results.Json(await service.PublicTournamentAsync(slug), JsonApi.Options);
        }).RequireRateLimiting("public120");

        app.MapGet("/api/tournaments/{slug}/matches", async (HttpContext http) =>
        {
            var slug = SlugOf(http);
            var service = http.RequestServices.GetRequiredService<GameplayReadService>();
            var page = Pagination.ParsePage(Validate.Query(http));
            return Results.Json(await service.PublicScheduleAsync(slug, page), JsonApi.Options);
        }).RequireRateLimiting("public120");

        app.MapGet("/api/tournaments/{slug}/standings", async (HttpContext http) =>
        {
            var slug = SlugOf(http);
            var service = http.RequestServices.GetRequiredService<GameplayReadService>();
            return Results.Json(await service.PublicStandingsAsync(slug), JsonApi.Options);
        }).RequireRateLimiting("public120");

        return app;
    }

    private static string SlugOf(HttpContext http)
    {
        var slug = Validate.RouteString(http, "slug");
        if (!Regex.IsMatch(slug, "^[a-z0-9-]{1,100}$") && !Guid.TryParse(slug, out _))
            throw ApiException.BadRequest("slug must match pattern");
        return slug;
    }
}
