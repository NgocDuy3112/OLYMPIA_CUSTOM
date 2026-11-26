using System.Text.RegularExpressions;
using Microsoft.AspNetCore.RateLimiting;
using AOC.Api.Http;
using AOC.Api.Shared;
using AOC.Infrastructure.Configuration;

namespace AOC.Api.Modules.Auth;

public static class AuthRoutes
{
    private static readonly Regex CodePattern = new("^[0-9]{6}$", RegexOptions.Compiled);

    public static IEndpointRouteBuilder MapAuthRoutes(this IEndpointRouteBuilder app)
    {
        app.MapPost("/portal/auth/login", async (HttpContext http) =>
        {
            var body = Validate.Object(await Validate.ReadJsonBodyAsync(http));
            var username = Validate.RequiredString(body, "username", maxLength: 50, minLength: 1);
            var password = Validate.RequiredString(body, "password", maxLength: 256, minLength: 1);
            var auth = http.RequestServices.GetRequiredService<AuthService>();
            return Results.Json(await auth.StartLoginAsync(Surface.PORTAL, username, password), JsonApi.Options);
        }).RequireRateLimiting("strict10").DisableAntiforgery();

        app.MapPost("/portal/auth/mfa", async (HttpContext http) =>
        {
            var body = Validate.Object(await Validate.ReadJsonBodyAsync(http));
            var pendingToken = Validate.RequiredString(body, "pendingToken", minLength: 1);
            var code = Validate.RequiredString(body, "code", pattern: CodePattern);
            var auth = http.RequestServices.GetRequiredService<AuthService>();
            var token = await auth.FinishMfaAsync(Surface.PORTAL, pendingToken, code);
            Cookies.SetSession(http, Surface.PORTAL, token);
            return Results.Json(new { ok = true }, JsonApi.Options);
        }).RequireRateLimiting("strict10").DisableAntiforgery();

        app.MapGet("/portal/auth/me", async (HttpContext http) =>
        {
            var user = await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
            return Results.Json(PublicUsers.Of(user), JsonApi.Options);
        });

        app.MapPost("/portal/auth/logout", (HttpContext http) =>
        {
            Cookies.ClearSession(http, Surface.PORTAL);
            return Results.Json(new { ok = true }, JsonApi.Options);
        });

        app.MapGet("/api/auth/me", async (HttpContext http) =>
        {
            var user = await http.RequireAuthAsync(Surface.GAMEPLAY);
            return Results.Json(PublicUsers.Of(user), JsonApi.Options);
        });

        app.MapPost("/api/auth/logout", (HttpContext http) =>
        {
            Cookies.ClearSession(http, Surface.GAMEPLAY);
            return Results.Json(new { ok = true }, JsonApi.Options);
        });

        return app;
    }
}
