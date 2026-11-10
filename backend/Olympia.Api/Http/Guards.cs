using Microsoft.EntityFrameworkCore;
using Olympia.Api.Shared;
using Olympia.Infrastructure.Auth;
using Olympia.Infrastructure.Configuration;
using Olympia.Infrastructure.Data;
using Olympia.Infrastructure.Data.Entities;

namespace Olympia.Api.Http;

/// <summary>
/// Port of lib/guards.ts — cookie → session user, with the password-change gate.
/// The authenticated user is stored in HttpContext.Items["sessionUser"].
/// </summary>
public static class Guards
{
    public const string SessionUserKey = "sessionUser";

    private static readonly HashSet<string> PasswordChangeExempt =
    [
        "/gameplay/auth/me",
        "/gameplay/auth/logout",
        "/gameplay/auth/change-password"
    ];

    public static async Task<UserEntity> AuthenticateAsync(HttpContext http, Surface surface)
    {
        var db = http.RequestServices.GetRequiredService<OlympiaDbContext>();
        var tokens = http.RequestServices.GetRequiredService<SessionTokens>();

        var cookieName = CookieNames.For(surface);
        if (!http.Request.Cookies.TryGetValue(cookieName, out var token) || string.IsNullOrEmpty(token))
            throw ApiException.Unauthorized("Missing session cookie");

        SessionTokenPayload payload;
        try
        {
            payload = tokens.VerifySession(surface, token);
        }
        catch
        {
            throw ApiException.Unauthorized("Invalid or expired session");
        }

        if (!Guid.TryParse(payload.Sub, out var userId))
            throw ApiException.Unauthorized("Account not found");

        var user = await db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == userId)
            ?? throw ApiException.Unauthorized("Account not found");
        if (user.DisabledAt is not null)
            throw ApiException.Unauthorized("Account disabled");
        if (user.TokenVersion != payload.TokenVersion)
            throw ApiException.Unauthorized("Session revoked");

        return user;
    }

    public static async Task<UserEntity> RequireAuthAsync(this HttpContext http, Surface surface)
    {
        var user = await AuthenticateAsync(http, surface);

        if (user.MustChangePassword)
        {
            var path = http.Request.Path.Value ?? "";
            if (!PasswordChangeExempt.Contains(path))
            {
                throw new ApiException(409, "PASSWORD_CHANGE_REQUIRED", "Hãy đặt mật khẩu của bạn trước khi tiếp tục.");
            }
        }

        http.Items[SessionUserKey] = user;
        return user;
    }

    public static async Task<UserEntity> RequireRoleAsync(
        this HttpContext http, Surface surface, params string[] roles)
    {
        var user = await AuthenticateAsync(http, surface);
        if (!roles.Contains(user.Role.ToString()))
            throw ApiException.Forbidden("Insufficient role");

        http.Items[SessionUserKey] = user;
        return user;
    }

    /// <summary>The session user of the current request (after a guard ran).</summary>
    public static UserEntity SessionUser(this HttpContext http)
        => (UserEntity)http.Items[SessionUserKey]!;
}
