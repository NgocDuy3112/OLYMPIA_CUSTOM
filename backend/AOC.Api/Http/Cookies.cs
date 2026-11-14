using AOC.Infrastructure.Configuration;

namespace AOC.Api.Http;

/// <summary>Port of lib/cookies.ts — host-only session cookies.</summary>
public static class Cookies
{
    public static void SetSession(HttpContext http, Surface surface, string token)
    {
        var options = new CookieOptions
        {
            HttpOnly = true,
            Secure = AppConfig.Instance.IsProduction,
            SameSite = SameSiteMode.Lax,
            Path = "/",
            MaxAge = TimeSpan.FromHours(12)
        };
        var domain = AppConfig.Instance.For(surface).CookieDomain;
        if (!string.IsNullOrEmpty(domain)) options.Domain = domain;
        http.Response.Cookies.Append(CookieNames.For(surface), token, options);
    }

    public static void ClearSession(HttpContext http, Surface surface)
    {
        var options = new CookieOptions { Path = "/" };
        var domain = AppConfig.Instance.For(surface).CookieDomain;
        if (!string.IsNullOrEmpty(domain)) options.Domain = domain;
        http.Response.Cookies.Delete(CookieNames.For(surface), options);
    }
}
