using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Olympia.Api.Http;
using Olympia.Api.Modules.Tournaments;
using Olympia.Api.Shared;
using Olympia.Domain.Contracts;
using Olympia.Infrastructure.Auth;
using Olympia.Infrastructure.Configuration;
using Olympia.Infrastructure.Data;
using Olympia.Infrastructure.Data.Entities;

namespace Olympia.Api.Modules.Roster;

public enum GroupLabel
{
    A,
    B
}

/// <summary>Port of roster/service.ts.</summary>
public sealed class RosterService(OlympiaDbContext db)
{
    private const string PlaceholderDomain = "@players.invalid";
    private const int PasswordMin = 8;
    private static readonly Regex EmailShape = new(@"^[^\s@]+@[^\s@]+\.[^\s@]{2,}$", RegexOptions.Compiled);

    private static string NoAccountYet(string email) =>
        $"no account exists for {email} yet — have the desk create them (or sign in with Google once), then enroll the address here";

    public async Task<int> EnrollPlayersAsync(Guid tournamentId, IReadOnlyList<Guid> userIds)
    {
        if (userIds.Count == 0) return 0;

        var existing = await db.TournamentPlayers
            .Where(p => p.TournamentId == tournamentId)
            .Select(p => p.UserId)
            .ToListAsync();
        var present = existing.ToHashSet();
        foreach (var userId in userIds)
        {
            if (present.Contains(userId)) continue;
            db.TournamentPlayers.Add(new TournamentPlayerEntity
            {
                TournamentId = tournamentId,
                UserId = userId
            });
        }
        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException)
        {
            // ON CONFLICT DO NOTHING — a concurrent enroll can race; recount below.
            db.ChangeTracker.Clear();
        }

        return await db.TournamentPlayers.CountAsync(p => p.TournamentId == tournamentId);
    }

    public async Task<EnrolledResult> EnrollByEmailAsync(string tournamentId, string rawEmail)
    {
        var tid = Guid.Parse(tournamentId);
        var email = rawEmail.Trim().ToLowerInvariant();
        if (!EmailShape.IsMatch(email))
            throw new TournamentError(TournamentErrorCode.VALIDATION,
                $"\"{rawEmail}\" does not look like an email address");
        if (email.EndsWith(PlaceholderDomain))
            throw new TournamentError(TournamentErrorCode.NOT_FOUND, NoAccountYet(email));

        var user = await db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Email == email);
        if (user is null || user.Role != UserRole.PLAYER)
            throw new TournamentError(TournamentErrorCode.NOT_FOUND, NoAccountYet(email));
        if (user.DisabledAt is not null)
            throw new TournamentError(TournamentErrorCode.FORBIDDEN, $"{email} belongs to a disabled account");

        if (await EnrolledRowAsync(tid, user.Id) is not null)
            throw new TournamentError(TournamentErrorCode.CONFLICT, $"{email} is already on this roster");

        await EnrollPlayersAsync(tid, [user.Id]);
        return new EnrolledResult(user.Id.ToString(), user.DisplayName, email!, null);
    }

    public async Task<ContestantResult> CreateContestantAsync(
        string tournamentId, string displayName, string password, string? email)
    {
        var tid = Guid.Parse(tournamentId);
        var name = displayName.Trim();
        if (name.Length == 0)
            throw new TournamentError(TournamentErrorCode.VALIDATION, "a contestant needs a display name");
        if (password.Length < PasswordMin)
            throw new TournamentError(TournamentErrorCode.VALIDATION,
                $"a first password needs at least {PasswordMin} characters");

        var roster = await ListEnrolledAsync(tournamentId);
        if (roster.Any(r => r.DisplayName.ToLowerInvariant() == name.ToLowerInvariant()))
            throw new TournamentError(TournamentErrorCode.CONFLICT,
                $"\"{name}\" is already a contestant in this tournament");

        var address = email?.Trim().ToLowerInvariant();
        if (!string.IsNullOrEmpty(address) && !EmailShape.IsMatch(address))
            throw new TournamentError(TournamentErrorCode.VALIDATION,
                $"\"{email}\" does not look like an email address");

        if (!string.IsNullOrEmpty(address))
        {
            var existing = await db.Users.AsNoTracking()
                .FirstOrDefaultAsync(u => u.Email == address);
            if (existing is not null)
                throw new TournamentError(TournamentErrorCode.CONFLICT,
                    $"\"{address}\" already belongs to {existing.DisplayName} — enroll that account instead of creating a new one",
                    [existing.Id.ToString(), existing.DisplayName]);
        }

        var username = await Usernames.PickUsernameAsync(db, name);
        var user = new UserEntity
        {
            Role = UserRole.PLAYER,
            Username = username,
            DisplayName = name,
            Email = address,
            EmailVerified = address is not null,
            PasswordHash = await PasswordHasher.HashAsync(password),
            MustChangePassword = true,
            TokenVersion = 0
        };
        db.Users.Add(user);
        await db.SaveChangesAsync();

        await EnrollPlayersAsync(tid, [user.Id]);
        return new ContestantResult(user.Id.ToString(), user.DisplayName, user.Username, null);
    }

    public async Task<object> ResetPasswordAsync(string tournamentId, string userId, string password)
    {
        var tid = Guid.Parse(tournamentId);
        var uid = Guid.Parse(userId);
        if (await EnrolledRowAsync(tid, uid) is null)
            throw new TournamentError(TournamentErrorCode.NOT_ENROLLED,
                "this player is not enrolled in the tournament");
        if (password.Length < PasswordMin)
            throw new TournamentError(TournamentErrorCode.VALIDATION,
                $"a first password needs at least {PasswordMin} characters");

        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == uid)
            ?? throw new TournamentError(TournamentErrorCode.NOT_FOUND, "no such account");
        if (user.DisabledAt is not null)
            throw new TournamentError(TournamentErrorCode.FORBIDDEN,
                $"{user.Username} belongs to a disabled account");

        user.PasswordHash = await PasswordHasher.HashAsync(password);
        user.MustChangePassword = true;
        user.TokenVersion = user.TokenVersion + 1;
        user.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        return new { userId, username = user.Username };
    }

    public sealed record EnrolledRow(
        string UserId,
        string DisplayName,
        string Username,
        string? Email,
        string? DiscordId,
        bool HasPassword,
        bool MustChangePassword,
        GroupLabel? Group,
        DateTime EnrolledAt);

    public async Task<List<EnrolledRow>> ListEnrolledAsync(string tournamentId)
    {
        var tid = Guid.Parse(tournamentId);
        var rows = await (
            from tp in db.TournamentPlayers.AsNoTracking()
            join u in db.Users.AsNoTracking() on tp.UserId equals u.Id
            where tp.TournamentId == tid
            select new
            {
                UserId = tp.UserId,
                u.DisplayName,
                u.Username,
                u.Email,
                u.DiscordId,
                HasPassword = u.PasswordHash != null,
                u.MustChangePassword,
                tp.Group,
                tp.EnrolledAt
            }
        ).ToListAsync();

        return rows.Select(row => new EnrolledRow(
            row.UserId.ToString(),
            row.DisplayName,
            row.Username,
            row.Email is not null && !row.Email.EndsWith(PlaceholderDomain) ? row.Email : null,
            row.DiscordId,
            row.HasPassword,
            row.MustChangePassword,
            ToGroupLabel(row.Group),
            row.EnrolledAt)).ToList();
    }

    public async Task<(string DisplayName, string? Email)> UpdateContestantAsync(
        string tournamentId, string userId, JsonElement edit)
    {
        var tid = Guid.Parse(tournamentId);
        var uid = Guid.Parse(userId);
        if (await EnrolledRowAsync(tid, uid) is null)
            throw new TournamentError(TournamentErrorCode.NOT_ENROLLED,
                "this player is not enrolled in the tournament");

        var user = await db.Users.FirstAsync(u => u.Id == uid);
        var roster = await ListEnrolledAsync(tournamentId);

        if (edit.TryGetProperty("discordId", out var discordEl))
        {
            user.DiscordId = discordEl.ValueKind switch
            {
                JsonValueKind.Null => null,
                JsonValueKind.String => discordEl.GetString()!.Trim(),
                _ => throw new TournamentError(TournamentErrorCode.VALIDATION, "discordId must be a string")
            };
            if (user.DiscordId == "") user.DiscordId = null;
        }

        if (edit.TryGetProperty("displayName", out var nameEl) && nameEl.ValueKind == JsonValueKind.String)
        {
            var name = nameEl.GetString()!.Trim();
            if (name.Length == 0)
                throw new TournamentError(TournamentErrorCode.VALIDATION, "a contestant needs a display name");
            var clash = roster.FirstOrDefault(r =>
                r.UserId != userId && r.DisplayName.ToLowerInvariant() == name.ToLowerInvariant());
            if (clash is not null)
                throw new TournamentError(TournamentErrorCode.CONFLICT,
                    $"\"{name}\" is already a contestant in this tournament");
            user.DisplayName = name;
        }

        if (edit.TryGetProperty("email", out var emailEl))
        {
            if (emailEl.ValueKind == JsonValueKind.Null
                || (emailEl.ValueKind == JsonValueKind.String && string.IsNullOrWhiteSpace(emailEl.GetString())))
            {
                user.Email = null;
            }
            else if (emailEl.ValueKind == JsonValueKind.String)
            {
                var address = emailEl.GetString()!.Trim().ToLowerInvariant();
                if (!EmailShape.IsMatch(address))
                    throw new TournamentError(TournamentErrorCode.VALIDATION,
                        $"\"{emailEl.GetString()}\" does not look like an email address");
                var owner = await db.Users.AsNoTracking()
                    .FirstOrDefaultAsync(u => u.Email == address);
                if (owner is not null && owner.Id != uid)
                    throw new TournamentError(TournamentErrorCode.CONFLICT,
                        $"\"{address}\" already belongs to {owner.DisplayName} — enroll that account instead of creating a new one",
                        [owner.Id.ToString(), owner.DisplayName]);
                user.Email = address;
            }
        }

        user.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        string? emailOut = null;
        if (user.Email is not null && !user.Email.EndsWith(PlaceholderDomain))
        {
            emailOut = user.Email;
        }
        return (user.DisplayName, emailOut);
    }

    public async Task RemoveContestantAsync(string tournamentId, string userId)
    {
        var tid = Guid.Parse(tournamentId);
        var uid = Guid.Parse(userId);
        if (await EnrolledRowAsync(tid, uid) is null)
            throw new TournamentError(TournamentErrorCode.NOT_ENROLLED,
                "this player is not enrolled in the tournament");

        // Same three-way count as the TS raw SQL.
        await using var connection = await RawSql.OpenAsync(db);
        await using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT (
                (SELECT count(*) FROM answers a
                   JOIN matches m ON m.id = a.match_id
                  WHERE m.tournament_id = @tid AND a.user_id = @uid)
              + (SELECT count(*) FROM match_stats s
                  WHERE s.tournament_id = @tid AND s.user_id = @uid)
              + (SELECT count(*) FROM score_adjustments adj
                   JOIN matches m2 ON m2.id = adj.match_id
                  WHERE m2.tournament_id = @tid AND adj.user_id = @uid)
            )::int AS played
            """;
        AddParam(command, "tid", tid);
        AddParam(command, "uid", uid);
        var played = Convert.ToInt32(await command.ExecuteScalarAsync());
        if (played > 0)
            throw new TournamentError(TournamentErrorCode.CONFLICT,
                "this contestant has played in this tournament — their results are on the record",
                [played.ToString()]);

        await using var seatCommand = connection.CreateCommand();
        seatCommand.CommandText = """
            SELECT count(*)::int AS seated FROM matches m
             WHERE m.tournament_id = @tid
               AND m.deleted_at IS NULL
               AND m.players @> @needle::jsonb
            """;
        AddParam(seatCommand, "tid", tid);
        AddParam(seatCommand, "needle",
            System.Text.Json.JsonSerializer.Serialize(new[] { new { userId = userId } }));
        var seated = Convert.ToInt32(await seatCommand.ExecuteScalarAsync());
        if (seated > 0)
            throw new TournamentError(TournamentErrorCode.CONFLICT,
                "this contestant still holds a seat in a match — take them out of the match first");

        var row = await db.TournamentPlayers
            .FirstOrDefaultAsync(p => p.TournamentId == tid && p.UserId == uid);
        if (row is not null)
        {
            db.TournamentPlayers.Remove(row);
            await db.SaveChangesAsync();
        }
    }

    public async Task<bool> AssignGroupAsync(string tournamentId, string userId, GroupLabel? group)
    {
        var row = await db.TournamentPlayers
            .FirstOrDefaultAsync(p => p.TournamentId == Guid.Parse(tournamentId)
                && p.UserId == Guid.Parse(userId));
        if (row is null) return false;

        if (group is null)
        {
            row.Group = null;
        }
        else if (group == GroupLabel.A)
        {
            row.Group = PlayerGroup.A;
        }
        else
        {
            row.Group = PlayerGroup.B;
        }

        await db.SaveChangesAsync();
        return true;
    }

    private static GroupLabel? ToGroupLabel(PlayerGroup? group)
    {
        if (group is null) return null;
        if (group == PlayerGroup.A) return GroupLabel.A;
        return GroupLabel.B;
    }

    private Task<TournamentPlayerEntity?> EnrolledRowAsync(Guid tournamentId, Guid userId)
        => db.TournamentPlayers.AsNoTracking()
            .FirstOrDefaultAsync(p => p.TournamentId == tournamentId && p.UserId == userId);

    private static void AddParam(System.Data.Common.DbCommand command, string name, object value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.Value = value;
        command.Parameters.Add(parameter);
    }
}

public sealed record EnrolledResult(string UserId, string DisplayName, string Email, GroupLabel? Group);

public sealed record ContestantResult(string UserId, string DisplayName, string Username, GroupLabel? Group);
