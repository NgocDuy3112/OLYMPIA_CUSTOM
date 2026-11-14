using System.Text.Json;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using AOC.Api.Http;
using AOC.Api.Shared;
using AOC.Infrastructure.Auth;
using AOC.Infrastructure.Configuration;
using AOC.Infrastructure.Data;
using AOC.Infrastructure.Oidc;
using AOC.Infrastructure.Data.Entities;

namespace AOC.Api.Modules.Auth;

public static class GoogleAuthRoutes
{
    private const string OauthPendingCookie = "oauth_pending";
    private const int PendingMaxAgeSeconds = 10 * 60;
    private const string RedirectPath = "/gameplay/auth/google";

    public static IEndpointRouteBuilder MapGoogleAuthRoutes(this IEndpointRouteBuilder app)
    {
        app.MapGet("/gameplay/auth/methods", (HttpContext http) =>
        {
            var oidc = http.RequestServices.GetRequiredService<GoogleOidcService>();
            return Results.Json(new { google = oidc.Configured }, JsonApi.Options);
        }).RequireRateLimiting("strict10");

        app.MapGet("/gameplay/auth/google", async (HttpContext http) =>
        {
            var oidc = http.RequestServices.GetRequiredService<GoogleOidcService>();
            var tokens = http.RequestServices.GetRequiredService<SessionTokens>();

            string url;
            (string State, string Nonce, string CodeVerifier, string CodeChallenge) parameters;
            try
            {
                if (!oidc.Configured)
                    return Results.Redirect("/login?notice=google-off");
                parameters = oidc.CreateParameters();
                url = await oidc.BuildAuthorizationUrlAsync(
                    AppConfig.Instance.GoogleOidc.RedirectUri!,
                    parameters.State, parameters.Nonce, parameters.CodeChallenge);
            }
            catch (SignInException)
            {
                return Results.Redirect("/login?notice=google-off");
            }

            var next = Redirects.SafeNextPath(
                http.Request.Query.TryGetValue("next", out var rawNext) ? rawNext.ToString() : null);

            var pending = new OauthPendingToken(
                parameters.State, parameters.Nonce, parameters.CodeVerifier, "oauth", next);
            AppendPendingCookie(http, tokens.SignOauthPending(pending));

            return Results.Redirect(url);
        }).RequireRateLimiting("strict10");

        app.MapGet("/gameplay/auth/google/callback", async (HttpContext http) =>
        {
            var oidc = http.RequestServices.GetRequiredService<GoogleOidcService>();
            var tokens = http.RequestServices.GetRequiredService<SessionTokens>();
            var db = http.RequestServices.GetRequiredService<AOCDbContext>();

            if (!http.Request.Cookies.TryGetValue(OauthPendingCookie, out var raw) || string.IsNullOrEmpty(raw))
                throw ApiException.BadRequest("OAuth state missing or expired, start again");

            OauthPendingToken pending;
            try
            {
                pending = tokens.VerifyOauthPending(raw);
            }
            catch
            {
                ClearPendingCookie(http);
                throw ApiException.BadRequest("OAuth state invalid, start again");
            }
            if (pending.Purpose != "oauth")
                throw ApiException.BadRequest("Invalid OAuth state");

            var currentUrl = $"{http.Request.Scheme}://{http.Request.Host}{http.Request.Path}{http.Request.QueryString}";
            var code = GoogleOidcService.CodeFromCallback(currentUrl);
            if (string.IsNullOrEmpty(code))
            {
                ClearPendingCookie(http);
                throw ApiException.BadRequest("Google sign-in failed, try again");
            }

            GoogleClaims claims;
            try
            {
                claims = await oidc.ExchangeCodeAsync(currentUrl, code, pending.CodeVerifier, pending.Nonce);
            }
            catch (SignInException)
            {
                ClearPendingCookie(http);
                throw ApiException.BadRequest("Google sign-in failed, try again");
            }

            if (string.IsNullOrEmpty(claims.Sub))
                throw ApiException.BadRequest("Google returned no identity");

            UserEntity user;
            try
            {
                user = await FindOrCreatePlayerAsync(db, claims);
            }
            catch (SignInException ex)
            {
                throw ApiException.Forbidden(ex.Message);
            }

            ClearPendingCookie(http);
            var sessionToken = tokens.SignSession(Surface.GAMEPLAY,
                new SessionTokenPayload(user.Id.ToString(), user.Role.ToString(), user.TokenVersion));
            Cookies.SetSession(http, Surface.GAMEPLAY, sessionToken);
            return Results.Redirect(Redirects.SafeNextPath(pending.Next));
        }).RequireRateLimiting("strict10");

        return app;
    }

    private static void AppendPendingCookie(HttpContext http, string token)
    {
        var options = new CookieOptions
        {
            HttpOnly = true,
            Secure = AppConfig.Instance.IsProduction,
            SameSite = SameSiteMode.Lax,
            Path = RedirectPath,
            MaxAge = TimeSpan.FromSeconds(PendingMaxAgeSeconds)
        };
        http.Response.Cookies.Append(OauthPendingCookie, token, options);
    }

    private static void ClearPendingCookie(HttpContext http)
    {
        http.Response.Cookies.Delete(OauthPendingCookie, new CookieOptions { Path = RedirectPath });
    }

    private static bool IsUniqueViolation(DbUpdateException ex)
        => ex.InnerException is PostgresException { SqlState: "23505" };

    /// <summary>Port of provisionPlayer + findOrCreatePlayer.</summary>
    private static async Task<UserEntity> FindOrCreatePlayerAsync(AOCDbContext db, GoogleClaims claims)
    {
        try
        {
            return await ProvisionPlayerAsync(db, claims);
        }
        catch (DbUpdateException error) when (IsUniqueViolation(error))
        {
            var linked = await db.OauthAccounts
                .FirstOrDefaultAsync(a => a.Provider == "google" && a.Sub == claims.Sub);
            if (linked is null) throw;

            var user = await db.Users.FirstOrDefaultAsync(u => u.Id == linked.UserId)
                ?? throw new SignInException("OAuth account points to a missing user");
            if (user.DisabledAt is not null) throw new SignInException("Account disabled");
            return user;
        }
    }

    private static async Task<UserEntity> ProvisionPlayerAsync(AOCDbContext db, GoogleClaims claims)
    {
        var linked = await db.OauthAccounts
            .FirstOrDefaultAsync(a => a.Provider == "google" && a.Sub == claims.Sub);

        if (linked is not null)
        {
            var user = await db.Users.FirstOrDefaultAsync(u => u.Id == linked.UserId)
                ?? throw new SignInException("OAuth account points to a missing user");
            if (user.DisabledAt is not null) throw new SignInException("Account disabled");

            user.DisplayName = claims.Name ?? user.DisplayName;
            user.AvatarUrl = claims.Picture ?? user.AvatarUrl;
            user.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();
            return user;
        }

        var email = claims.Email;
        if (string.IsNullOrEmpty(email) || claims.EmailVerified != true)
            throw new SignInException("Your Google account has no verified email address");

        var byEmail = await db.Users.FirstOrDefaultAsync(u => u.Email == email);
        if (byEmail is not null)
        {
            if (byEmail.DisabledAt is not null) throw new SignInException("Account disabled");
            db.OauthAccounts.Add(new OauthAccountEntity
            {
                UserId = byEmail.Id,
                Provider = "google",
                Sub = claims.Sub!
            });
            await db.SaveChangesAsync();
            return byEmail;
        }

        for (var attempt = 1; ; attempt += 1)
        {
            try
            {
                var displayName = claims.Name ?? email;
                var username = await Usernames.PickUsernameAsync(db,
                    claims.Name ?? email.Split('@')[0] ?? displayName);

                var created = new UserEntity
                {
                    Role = UserRole.PLAYER,
                    Username = username,
                    Email = email,
                    EmailVerified = true,
                    DisplayName = displayName,
                    AvatarUrl = claims.Picture
                };
                db.Users.Add(created);
                await db.SaveChangesAsync();

                db.OauthAccounts.Add(new OauthAccountEntity
                {
                    UserId = created.Id,
                    Provider = "google",
                    Sub = claims.Sub!
                });
                await db.SaveChangesAsync();
                return created;
            }
            catch (DbUpdateException error) when (attempt < 2 && IsUniqueViolation(error))
            {
                // retry once, like the TS loop
            }
        }
    }
}
