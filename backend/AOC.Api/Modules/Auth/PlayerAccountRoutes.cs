using System.Text.RegularExpressions;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using AOC.Api.Http;
using AOC.Api.Shared;
using AOC.Infrastructure.Auth;
using AOC.Infrastructure.Configuration;
using AOC.Infrastructure.Data;
using AOC.Infrastructure.Data.Entities;
using AOC.Infrastructure.Email;

namespace AOC.Api.Modules.Auth;

public static class PlayerAccountRoutes
{
    private const int PasswordMin = 8;
    private static readonly Regex EmailPattern =
        new("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", RegexOptions.Compiled);

    public static IEndpointRouteBuilder MapPlayerAccountRoutes(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/auth/register", async (HttpContext http) =>
        {
            var body = Validate.Object(await Validate.ReadJsonBodyAsync(http));
            var email = Validate.RequiredString(body, "email", maxLength: 256, minLength: 3)
                .Trim()
                .ToLowerInvariant();
            if (!EmailPattern.IsMatch(email))
                throw ApiException.BadRequest("Email không hợp lệ.");
            var password = Validate.RequiredString(body, "password", maxLength: 256, minLength: 1);
            if (password.Length < PasswordMin)
                throw ApiException.BadRequest($"Mật khẩu cần ít nhất {PasswordMin} ký tự.");
            var displayName = Validate.OptionalString(body, "displayName", maxLength: 80);

            var db = http.RequestServices.GetRequiredService<AOCDbContext>();
            var tokens = http.RequestServices.GetRequiredService<SessionTokens>();

            var taken = await db.Users.AnyAsync(u => u.Email != null && u.Email.ToLower() == email);
            if (taken) throw ApiException.Conflict("Email này đã được dùng — hãy đăng nhập.");

            var name = string.IsNullOrWhiteSpace(displayName) ? email.Split('@')[0] : displayName.Trim();
            var user = new UserEntity
            {
                Role = UserRole.PLAYER,
                Username = await Usernames.PickUsernameAsync(db, name),
                Email = email,
                DisplayName = name,
                PasswordHash = await PasswordHasher.HashAsync(password)
            };
            db.Users.Add(user);
            await db.SaveChangesAsync();

            Cookies.SetSession(http, Surface.GAMEPLAY, tokens.SignSession(Surface.GAMEPLAY,
                new SessionTokenPayload(user.Id.ToString(), user.Role.ToString(), user.TokenVersion)));
            return Results.Json(new { ok = true, displayName = user.DisplayName }, JsonApi.Options);
        }).RequireRateLimiting("strict10").DisableAntiforgery();

        app.MapPost("/api/auth/login", async (HttpContext http) =>
        {
            var body = Validate.Object(await Validate.ReadJsonBodyAsync(http));
            var email = Validate.RequiredString(body, "email", maxLength: 256, minLength: 1)
                .Trim()
                .ToLowerInvariant();
            var password = Validate.RequiredString(body, "password", maxLength: 256, minLength: 1);

            var db = http.RequestServices.GetRequiredService<AOCDbContext>();
            var tokens = http.RequestServices.GetRequiredService<SessionTokens>();

            var user = await db.Users.FirstOrDefaultAsync(u =>
                (u.Email != null && u.Email.ToLower() == email) || u.Username.ToLower() == email);
            var invalid = () => ApiException.Unauthorized("Email hoặc mật khẩu không đúng.");
            if (user is null || user.PasswordHash is null) throw invalid();
            if (!await PasswordHasher.VerifyAsync(user.PasswordHash, password)) throw invalid();
            if (user.DisabledAt is not null) throw ApiException.Forbidden("Tài khoản đã bị vô hiệu.");

            Cookies.SetSession(http, Surface.GAMEPLAY, tokens.SignSession(Surface.GAMEPLAY,
                new SessionTokenPayload(user.Id.ToString(), user.Role.ToString(), user.TokenVersion)));
            return Results.Json(new { ok = true, displayName = user.DisplayName }, JsonApi.Options);
        }).RequireRateLimiting("strict10").DisableAntiforgery();

        app.MapPost("/api/auth/change-password", async (HttpContext http) =>
        {
            var user = await http.RequireAuthAsync(Surface.GAMEPLAY);
            var body = Validate.Object(await Validate.ReadJsonBodyAsync(http));
            var currentPassword = Validate.OptionalString(body, "currentPassword", maxLength: 256);
            var newPassword = Validate.RequiredString(body, "newPassword", maxLength: 256, minLength: 1);

            if (newPassword.Length < PasswordMin)
                throw ApiException.BadRequest($"Mật khẩu cần ít nhất {PasswordMin} ký tự.");

            var db = http.RequestServices.GetRequiredService<AOCDbContext>();
            var tokens = http.RequestServices.GetRequiredService<SessionTokens>();

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

        app.MapPost("/api/auth/forgot-password", async (HttpContext http) =>
        {
            var body = Validate.Object(await Validate.ReadJsonBodyAsync(http));
            var email = Validate.RequiredString(body, "email", maxLength: 256, minLength: 1);
            var db = http.RequestServices.GetRequiredService<AOCDbContext>();
            var sender = http.RequestServices.GetRequiredService<IEmailService>();
            await new PasswordResetService(db, sender).RequestResetAsync(email, http.RequestAborted);
            return Results.Json(new { ok = true }, JsonApi.Options);
        }).RequireRateLimiting("strict10").DisableAntiforgery();

        app.MapPost("/api/auth/reset-password", async (HttpContext http) =>
        {
            var body = Validate.Object(await Validate.ReadJsonBodyAsync(http));
            var email = Validate.RequiredString(body, "email", maxLength: 256, minLength: 1);
            var code = Validate.RequiredString(body, "code", maxLength: 32, minLength: 1);
            var newPassword = Validate.RequiredString(body, "newPassword", maxLength: 256, minLength: 1);
            var db = http.RequestServices.GetRequiredService<AOCDbContext>();
            var sender = http.RequestServices.GetRequiredService<IEmailService>();
            await new PasswordResetService(db, sender)
                .ResetPasswordAsync(email, code, newPassword, http.RequestAborted);
            return Results.Json(new { ok = true }, JsonApi.Options);
        }).RequireRateLimiting("strict10").DisableAntiforgery();

        app.MapGet("/api/me/match", async (HttpContext http) =>
        {
            var user = await http.RequireAuthAsync(Surface.GAMEPLAY);
            var db = http.RequestServices.GetRequiredService<AOCDbContext>();

            var needle = System.Text.Json.JsonSerializer.Serialize(
                new[] { new { userId = user.Id.ToString() } });

            await using var connection = await RawSql.OpenAsync(db);
            await using var command = connection.CreateCommand();
            command.CommandText = """
                SELECT m.id, m.label, m.status::text, m.scheduled_at, t.slug, t.id, t.name
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
                    tournamentId = reader.GetGuid(5).ToString(),
                    tournamentName = reader.GetString(6)
                });
            }

            return Results.Json(new { items }, JsonApi.Options);
        });

        return app;
    }
}
