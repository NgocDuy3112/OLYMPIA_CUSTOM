using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using AOC.Api.Modules.Tournaments;
using AOC.Infrastructure.Data;
using AOC.Infrastructure.Data.Entities;

namespace AOC.Api.Modules.Roster;

public enum GroupLabel
{
    A,
    B
}

/// <summary>Port of roster/service.ts.</summary>
public sealed class RosterService(AOCDbContext db)
{
    private const string PlaceholderDomain = "@players.invalid";
    private static readonly Regex EmailShape = new(@"^[^\s@]+@[^\s@]+\.[^\s@]{2,}$", RegexOptions.Compiled);

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

    public sealed record PlayerEnrollment(
        string TournamentId,
        string Name,
        bool Current,
        bool Closed);

    public sealed record PlayerAccount(
        string UserId,
        string DisplayName,
        string Username,
        string? Email,
        string? DiscordId,
        List<PlayerEnrollment> Enrollments);

    /// <summary>Every player account in the system with the tournaments it sits
    ///  in — the desk's global list. Accounts get here by signing in with Google;
    ///  enrollment is assigned afterwards.</summary>
    public async Task<List<PlayerAccount>> ListPlayersAsync()
    {
        var users = await db.Users.AsNoTracking()
            .Where(u => u.Role == UserRole.PLAYER)
            .OrderBy(u => u.DisplayName)
            .ThenBy(u => u.Username)
            .Select(u => new { u.Id, u.DisplayName, u.Username, u.Email, u.DiscordId })
            .ToListAsync();

        var memberships = await db.TournamentPlayers.AsNoTracking()
            .Select(p => new { p.UserId, p.TournamentId })
            .ToListAsync();

        var tournaments = await db.Tournaments.AsNoTracking()
            .Where(t => t.DeletedAt == null)
            .Select(t => new { t.Id, t.Name, t.Current, t.ClosedAt })
            .ToListAsync();
        var byId = tournaments.ToDictionary(t => t.Id);

        var idsByUser = memberships
            .Where(m => byId.ContainsKey(m.TournamentId))
            .GroupBy(m => m.UserId)
            .ToDictionary(g => g.Key, g => g.Select(m => m.TournamentId).ToList());

        return users.Select(user =>
        {
            List<Guid> enrolled = idsByUser.TryGetValue(user.Id, out var ids) ? ids : [];
            var enrollments = enrolled
                .Select(id => byId[id])
                .OrderBy(t => t.Current ? 0 : 1)
                .ThenBy(t => t.Name)
                .Select(t => new PlayerEnrollment(
                    t.Id.ToString(), t.Name, t.Current, t.ClosedAt != null))
                .ToList();

            return new PlayerAccount(
                user.Id.ToString(),
                user.DisplayName,
                user.Username ?? "",
                user.Email is not null && !user.Email.EndsWith(PlaceholderDomain) ? user.Email : null,
                user.DiscordId,
                enrollments);
        }).ToList();
    }

    public sealed record EnrolledRow(
        string UserId,
        string DisplayName,
        string Username,
        string? Email,
        string? DiscordId,
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
            ToGroupLabel(row.Group),
            row.EnrolledAt)).ToList();
    }

    /// <summary>Edits the ACCOUNT itself (name / email / Discord) — no
    ///  tournament involved, so it works for a player the desk hasn't enrolled yet.</summary>
    public async Task<(string DisplayName, string? Email)> UpdatePlayerAsync(
        string userId, JsonElement edit)
    {
        var uid = Guid.Parse(userId);
        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == uid)
            ?? throw new TournamentError(TournamentErrorCode.NOT_FOUND, "no such account");

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
                throw new TournamentError(TournamentErrorCode.VALIDATION, "a player needs a display name");
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
                        $"\"{address}\" already belongs to {owner.DisplayName} — that address links one Google account only",
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
