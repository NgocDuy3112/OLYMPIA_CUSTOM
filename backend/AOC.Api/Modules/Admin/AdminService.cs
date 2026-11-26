using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using AOC.Api.Http;
using AOC.Infrastructure.Auth;
using AOC.Infrastructure.Configuration;
using AOC.Infrastructure.Data;
using AOC.Infrastructure.Data.Entities;

namespace AOC.Api.Modules.Admin;

public sealed class AdminService(AOCDbContext db, SessionTokens tokens)
{
    private const int MinPasswordLength = 12;
    private static readonly Regex UsernamePattern = new("^[a-zA-Z0-9._-]{3,50}$", RegexOptions.Compiled);

    public sealed record PublicOperator(
        Guid Id, string Username, string DisplayName, UserRole Role, DateTime? DisabledAt, DateTime CreatedAt);

    public sealed record CreatedOperator(Guid OperatorId, string Username, string InviteToken);

    public sealed record InviteAccepted(bool Ok, string Username);

    public async Task<List<PublicOperator>> ListOperatorsAsync()
    {
        var rows = await db.Users.AsNoTracking()
            .Where(u => u.Role == UserRole.OPERATOR || u.Role == UserRole.ADMIN)
            .Select(u => new { u.Id, u.Username, u.DisplayName, u.Role, u.DisabledAt, u.CreatedAt })
            .ToListAsync();
        return rows.Select(u => new PublicOperator(
            u.Id, u.Username, u.DisplayName, u.Role, u.DisabledAt, u.CreatedAt)).ToList();
    }

    public async Task<CreatedOperator> CreateOperatorAsync(JsonElement body)
    {
        var username = Validate.RequiredString(body, "username", minLength: 3, maxLength: 50,
            pattern: UsernamePattern);
        var displayName = Validate.OptionalString(body, "displayName", minLength: 1, maxLength: 100);

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

        return new CreatedOperator(user.Id, user.Username, inviteToken);
    }

    public async Task<InviteAccepted> AcceptInviteAsync(JsonElement body)
    {
        var token = Validate.RequiredString(body, "token", minLength: 1);
        var password = Validate.RequiredString(body, "password", minLength: 1, maxLength: 256);

        if (password.Length < MinPasswordLength)
            throw ApiException.BadRequest($"Password must be at least {MinPasswordLength} characters");

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

        return new InviteAccepted(true, user.Username);
    }
}
