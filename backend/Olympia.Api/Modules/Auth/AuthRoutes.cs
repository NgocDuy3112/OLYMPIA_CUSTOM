using System.Text.RegularExpressions;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Olympia.Api.Http;
using Olympia.Api.Shared;
using Olympia.Infrastructure.Auth;
using Olympia.Infrastructure.Configuration;
using Olympia.Infrastructure.Data;
using Olympia.Infrastructure.Data.Entities;

namespace Olympia.Api.Modules.Auth;

/// <summary>Port of auth/service.ts — login + MFA completion.</summary>
public sealed class AuthService(OlympiaDbContext db, SessionTokens tokens)
{
    public sealed record LoginResult(string State, string? PendingToken, string? OtpauthUri);

    public async Task<LoginResult> StartLoginAsync(Surface surface, string username, string password)
    {
        var user = await db.Users.FirstOrDefaultAsync(u => u.Username == username);

        UserEntity Invalid() => throw ApiException.Unauthorized("Invalid username or password");

        if (user is null || user.PasswordHash is null) Invalid();
        if (!await PasswordHasher.VerifyAsync(user.PasswordHash!, password)) Invalid();
        if (user.DisabledAt is not null) throw ApiException.Forbidden("Account disabled");

        var pendingToken = tokens.SignPending(surface, new PendingMfaToken(user.Id.ToString(), "mfa"));

        if (user.TotpEnabledAt is null)
        {
            var secret = TotpService.NewTotpSecret();
            user.TotpSecret = secret;
            user.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();

            return new LoginResult("enroll", pendingToken, TotpService.OtpauthUri(secret, username));
        }

        return new LoginResult("mfa", pendingToken, null);
    }

    public async Task<string> FinishMfaAsync(Surface surface, string pendingToken, string code)
    {
        PendingMfaToken pending;
        try
        {
            pending = tokens.VerifyPending(surface, pendingToken);
        }
        catch
        {
            throw ApiException.Unauthorized("Login session expired, start again");
        }
        if (pending.Purpose != "mfa")
            throw ApiException.Unauthorized("Invalid login session");

        if (!Guid.TryParse(pending.Sub, out var userId))
            throw ApiException.Unauthorized("Login session expired, start again");

        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == userId);
        if (user is null || user.TotpSecret is null)
            throw ApiException.Unauthorized("Login session expired, start again");
        if (user.DisabledAt is not null) throw ApiException.Forbidden("Account disabled");

        var verification = TotpService.VerifyTotpCode(user.TotpSecret, code, user.TotpLastUsedStep);
        if (!verification.Ok)
        {
            throw ApiException.Unauthorized(
                verification.Reason == "reused"
                    ? "This code was already used"
                    : "That code didn't match");
        }

        user.TotpLastUsedStep = verification.Step;
        if (user.TotpEnabledAt is null) user.TotpEnabledAt = DateTime.UtcNow;
        user.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        return tokens.SignSession(surface,
            new SessionTokenPayload(user.Id.ToString(), user.Role.ToString(), user.TokenVersion));
    }
}

/// <summary>Route maps for /portal/auth/* and /gameplay/auth/me|logout.</summary>
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

        app.MapGet("/gameplay/auth/me", async (HttpContext http) =>
        {
            var user = await http.RequireAuthAsync(Surface.GAMEPLAY);
            return Results.Json(PublicUsers.Of(user), JsonApi.Options);
        });

        app.MapPost("/gameplay/auth/logout", (HttpContext http) =>
        {
            Cookies.ClearSession(http, Surface.GAMEPLAY);
            return Results.Json(new { ok = true }, JsonApi.Options);
        });

        return app;
    }
}
