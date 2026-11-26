using Microsoft.AspNetCore.RateLimiting;
using AOC.Api.Http;
using AOC.Api.Shared;
using AOC.Infrastructure.Auth;
using AOC.Infrastructure.Configuration;
using AOC.Infrastructure.Oidc;
using AOC.Infrastructure.Data.Entities;

namespace AOC.Api.Modules.Auth;

public static class GoogleAuthRoutes
{
    private const string OauthPendingCookie = "oauth_pending";
    private const int PendingMaxAgeSeconds = 10 * 60;
    private const string RedirectPath = "/auth/google";

    public static IEndpointRouteBuilder MapGoogleAuthRoutes(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/auth/methods", (HttpContext http) =>
        {
            var oidc = http.RequestServices.GetRequiredService<GoogleOidcService>();
            return Results.Json(new { google = oidc.Configured, password = true }, JsonApi.Options);
        }).RequireRateLimiting("strict10");

        app.MapGet("/auth/google", async (HttpContext http) =>
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

        app.MapGet("/auth/google/callback", async (HttpContext http) =>
        {
            var oidc = http.RequestServices.GetRequiredService<GoogleOidcService>();
            var tokens = http.RequestServices.GetRequiredService<SessionTokens>();
            var google = http.RequestServices.GetRequiredService<GoogleAuthService>();

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
                user = await google.FindOrCreatePlayerAsync(claims);
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

}
