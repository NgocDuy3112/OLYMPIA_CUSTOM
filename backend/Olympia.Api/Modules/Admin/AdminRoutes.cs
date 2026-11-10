using System.Text.RegularExpressions;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Olympia.Api.Http;
using Olympia.Api.Shared;
using Olympia.Infrastructure.Auth;
using Olympia.Infrastructure.Configuration;
using Olympia.Infrastructure.Data;
using Olympia.Infrastructure.Data.Entities;

namespace Olympia.Api.Modules.Admin;

/// <summary>Port of admin/service.ts + admin/routes.ts.</summary>
public static class AdminRoutes
{
    private const int MinPasswordLength = 12;
    private static readonly Regex UsernamePattern = new("^[a-zA-Z0-9._-]{3,50}$", RegexOptions.Compiled);

    public static IEndpointRouteBuilder MapAdminRoutes(this IEndpointRouteBuilder app)
    {
        app.MapGet("/portal/operators", async (HttpContext http) =>
        {
            await http.RequireRoleAsync(Surface.PORTAL, "ADMIN");
            var db = http.RequestServices.GetRequiredService<OlympiaDbContext>();
            var items = await db.Users.AsNoTracking()
                .Where(u => u.Role == UserRole.OPERATOR || u.Role == UserRole.ADMIN)
                .Select(u => new
                {
                    u.Id,
                    u.Username,
                    u.DisplayName,
                    u.Role,
                    u.DisabledAt,
                    u.CreatedAt
                })
                .ToListAsync();
            return Results.Json(new { items }, JsonApi.Options);
        });

        app.MapPost("/portal/operators", async (HttpContext http) =>
        {
            await http.RequireRoleAsync(Surface.PORTAL, "ADMIN");
            var body = Validate.Object(await Validate.ReadJsonBodyAsync(http));
            var username = Validate.RequiredString(body, "username", minLength: 3, maxLength: 50,
                pattern: UsernamePattern);
            var displayName = Validate.OptionalString(body, "displayName", minLength: 1, maxLength: 100);

            var db = http.RequestServices.GetRequiredService<OlympiaDbContext>();
            var tokens = http.RequestServices.GetRequiredService<SessionTokens>();

            var user = new UserEntity
            {
                Role = UserRole.OPERATOR,
                Username = username,
                DisplayName = displayName ?? username
            };
            db.Users.Add(user);
            try
            {
                await db.SaveChangesAsync();
            }
            catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: "23505" })
            {
                throw ApiException.Conflict("Username already taken");
            }

            var inviteToken = tokens.SignInvite(
                new InviteToken(user.Id.ToString(), user.TokenVersion, "invite"));

            http.Response.StatusCode = 201;
            return Results.Json(new { operatorId = user.Id, username = user.Username, inviteToken },
                JsonApi.Options);
        }).RequireRateLimiting("strict10");

        app.MapPost("/portal/invites/accept", async (HttpContext http) =>
        {
            var body = Validate.Object(await Validate.ReadJsonBodyAsync(http));
            var token = Validate.RequiredString(body, "token", minLength: 1);
            var password = Validate.RequiredString(body, "password", minLength: 1, maxLength: 256);

            if (password.Length < MinPasswordLength)
                throw ApiException.BadRequest($"Password must be at least {MinPasswordLength} characters");

            var tokens = http.RequestServices.GetRequiredService<SessionTokens>();
            var db = http.RequestServices.GetRequiredService<OlympiaDbContext>();

            InviteToken invite;
            try
            {
                invite = tokens.VerifyInvite(token);
            }
            catch
            {
                throw ApiException.BadRequest("Invite link is invalid or expired");
            }
            if (invite.Purpose != "invite")
                throw ApiException.BadRequest("Invite link is invalid");

            if (!Guid.TryParse(invite.Sub, out var userId))
                throw ApiException.BadRequest("Invite link is invalid or expired");

            var user = await db.Users.FirstOrDefaultAsync(u => u.Id == userId);
            if (user is null || user.DisabledAt is not null)
                throw ApiException.BadRequest("Invite link is invalid or expired");
            if (user.TokenVersion != invite.TokenVersion)
                throw ApiException.BadRequest("Invite link is no longer valid");
            if (user.PasswordHash is not null)
                throw ApiException.Conflict("This invite has already been used");

            user.PasswordHash = await PasswordHasher.HashAsync(password);
            user.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();

            return Results.Json(new { ok = true, username = user.Username }, JsonApi.Options);
        }).RequireRateLimiting("strict10").DisableAntiforgery();

        return app;
    }
}
