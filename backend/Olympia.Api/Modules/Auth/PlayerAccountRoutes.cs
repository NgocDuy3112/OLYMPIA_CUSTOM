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

/// <summary>Port of auth/player-account.ts — gameplay login, password change, my matches.</summary>
public static class PlayerAccountRoutes
{
    private const int PasswordMin = 8;

    public static IEndpointRouteBuilder MapPlayerAccountRoutes(this IEndpointRouteBuilder app)
    {
        app.MapPost("/gameplay/auth/login", async (HttpContext http) =>
        {
            var body = Validate.Object(await Validate.ReadJsonBodyAsync(http));
            var username = Validate.RequiredString(body, "username", maxLength: 50, minLength: 1);
            var password = Validate.RequiredString(body, "password", maxLength: 256, minLength: 1);

            var handle = username.Trim().ToLowerInvariant();
            var db = http.RequestServices.GetRequiredService<OlympiaDbContext>();
            var tokens = http.RequestServices.GetRequiredService<SessionTokens>();

            var user = await db.Users.FirstOrDefaultAsync(u => u.Username.ToLower() == handle);

            UserEntity Invalid() => throw ApiException.Unauthorized("Tên đăng nhập hoặc mật khẩu không đúng.");

            if (user?.PasswordHash is null) Invalid();
            if (!await PasswordHasher.VerifyAsync(user.PasswordHash!, password)) Invalid();
            if (user.DisabledAt is not null) throw ApiException.Forbidden("Tài khoản đã bị khoá.");

            Cookies.SetSession(http, Surface.GAMEPLAY, tokens.SignSession(Surface.GAMEPLAY,
                new SessionTokenPayload(user.Id.ToString(), user.Role.ToString(), user.TokenVersion)));

            return Results.Json(new
            {
                id = user.Id,
                username = user.Username,
                displayName = user.DisplayName,
                mustChangePassword = user.MustChangePassword
            }, JsonApi.Options);
        }).RequireRateLimiting("strict10").DisableAntiforgery();

        app.MapPost("/gameplay/auth/change-password", async (HttpContext http) =>
        {
            var user = await http.RequireAuthAsync(Surface.GAMEPLAY);
            var body = Validate.Object(await Validate.ReadJsonBodyAsync(http));
            var currentPassword = Validate.OptionalString(body, "currentPassword", maxLength: 256);
            var newPassword = Validate.RequiredString(body, "newPassword", maxLength: 256, minLength: 1);

            if (newPassword.Length < PasswordMin)
                throw ApiException.BadRequest($"Mật khẩu cần ít nhất {PasswordMin} ký tự.");

            var db = http.RequestServices.GetRequiredService<OlympiaDbContext>();
            var tokens = http.RequestServices.GetRequiredService<SessionTokens>();

            // Re-load for tracking (the guard's user is untracked).
            var tracked = await db.Users.FirstAsync(u => u.Id == user.Id);

            if (tracked.PasswordHash is not null)
            {
                if (currentPassword is null)
                    throw ApiException.BadRequest("Hãy nhập mật khẩu hiện tại.");
                if (!await PasswordHasher.VerifyAsync(tracked.PasswordHash, currentPassword))
                    throw ApiException.Unauthorized("Mật khẩu hiện tại không đúng.");
                if (currentPassword == newPassword)
                    throw ApiException.BadRequest("Mật khẩu mới phải khác mật khẩu hiện tại.");
            }

            var tokenVersion = tracked.TokenVersion + 1;
            tracked.PasswordHash = await PasswordHasher.HashAsync(newPassword);
            tracked.MustChangePassword = false;
            tracked.TokenVersion = tokenVersion;
            tracked.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();

            Cookies.SetSession(http, Surface.GAMEPLAY, tokens.SignSession(Surface.GAMEPLAY,
                new SessionTokenPayload(user.Id.ToString(), user.Role.ToString(), tokenVersion)));

            return Results.Json(new { ok = true, displayName = user.DisplayName }, JsonApi.Options);
        }).RequireRateLimiting("strict10").DisableAntiforgery();

        app.MapGet("/gameplay/me/match", async (HttpContext http) =>
        {
            var user = await http.RequireAuthAsync(Surface.GAMEPLAY);
            var db = http.RequestServices.GetRequiredService<OlympiaDbContext>();

            var needle = System.Text.Json.JsonSerializer.Serialize(
                new[] { new { userId = user.Id.ToString() } });

            await using var connection = await RawSql.OpenAsync(db);
            await using var command = connection.CreateCommand();
            command.CommandText = """
                SELECT m.id, m.label, m.status::text, m.scheduled_at, t.slug, t.name
                  FROM matches m
                  JOIN tournaments t ON t.id = m.tournament_id
                 WHERE (m.status = 'UPCOMING' OR m.status = 'LIVE')
                   AND m.players @> @needle::jsonb
                 ORDER BY m.scheduled_at DESC
                 LIMIT 5
                """;
            var param = command.CreateParameter();
            param.ParameterName = "needle";
            param.Value = needle;
            command.Parameters.Add(param);

            var items = new List<object>();
            await using var reader = await command.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                items.Add(new
                {
                    matchId = reader.GetGuid(0),
                    label = reader.GetString(1),
                    status = reader.GetString(2),
                    scheduledAt = reader.GetDateTime(3),
                    slug = reader.GetString(4),
                    tournamentName = reader.GetString(5)
                });
            }

            return Results.Json(new { items }, JsonApi.Options);
        });

        return app;
    }
}
