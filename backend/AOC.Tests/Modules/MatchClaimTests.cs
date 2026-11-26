using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using AOC.Api.Modules.MatchCodes;
using AOC.Domain.Contracts;
using AOC.Infrastructure.Data;
using AOC.Infrastructure.Data.Entities;
using AOC.Tests.Auth;
using Xunit;

namespace AOC.Tests.Modules;

public class MatchClaimTests
{
    private const string Code = "ABC234";

    private sealed record Seeded(Guid TournamentId, Guid MatchId, Guid OwnerId, List<Guid> UserIds);

    private static async Task<Seeded> SeedAsync(AOCDbContext db, MatchStatus status, int seats, int players)
    {
        var now = DateTime.UtcNow;
        var ownerId = Guid.NewGuid();
        var tournamentId = Guid.NewGuid();
        var matchId = Guid.NewGuid();
        var userIds = Enumerable.Range(0, players).Select(_ => Guid.NewGuid()).ToList();

        db.Users.Add(new UserEntity
        {
            Id = ownerId,
            Role = UserRole.OPERATOR,
            Username = "claim-owner-" + Guid.NewGuid().ToString("N")[..8],
            DisplayName = "Owner"
        });
        foreach (var userId in userIds)
        {
            db.Users.Add(new UserEntity
            {
                Id = userId,
                Role = UserRole.PLAYER,
                Username = "claim-" + Guid.NewGuid().ToString("N")[..8],
                DisplayName = "Player"
            });
        }
        await db.SaveChangesAsync();

        db.Tournaments.Add(new TournamentEntity
        {
            Id = tournamentId,
            Name = "Claim cup",
            Slug = Guid.NewGuid().ToString("N")[..12],
            Visibility = Visibility.PRIVATE,
            OwnerId = ownerId,
            Rounds = JsonDefaults.Serialize(Array.Empty<TournamentRound>()),
            Format = JsonDefaults.Serialize(new TournamentFormat { CompetitorsPerMatch = seats }),
            Stages = JsonDefaults.Serialize(Array.Empty<object>()),
            CreatedAt = now,
            UpdatedAt = now
        });
        await db.SaveChangesAsync();

        db.Matches.Add(new MatchEntity
        {
            Id = matchId,
            TournamentId = tournamentId,
            StageId = "s1",
            ScheduledAt = now,
            Label = "Vòng 1",
            Status = status,
            Players = JsonDefaults.Serialize(Array.Empty<Seat>()),
            RoundConfigs = JsonDefaults.Serialize(new Dictionary<string, RoundConfig>()),
            Questions = JsonDefaults.Serialize(Array.Empty<MatchQuestion>()),
            CreatedAt = now,
            UpdatedAt = now
        });
        await db.SaveChangesAsync();

        db.MatchCodes.Add(new MatchCodeEntity
        {
            Id = Guid.NewGuid(),
            Code = Code,
            MatchId = matchId,
            ExpiresAt = now.AddHours(1),
            CreatedAt = now
        });
        await db.SaveChangesAsync();

        return new Seeded(tournamentId, matchId, ownerId, userIds);
    }

    private static MatchCodesService ServiceFor(AOCDbContext db, ClaimAttemptLimiter limiter)
        => new(db, limiter, MatchCodesOptions.Default);

    private static async Task RemoveAsync(AOCDbContext db, Seeded seeded)
    {
        db.MatchCodes.RemoveRange(db.MatchCodes.Where(c => c.MatchId == seeded.MatchId));
        db.Matches.RemoveRange(db.Matches.Where(m => m.Id == seeded.MatchId));
        db.Tournaments.RemoveRange(db.Tournaments.Where(t => t.Id == seeded.TournamentId));
        await db.SaveChangesAsync();
        db.Users.RemoveRange(db.Users.Where(u => seeded.UserIds.Contains(u.Id) || u.Id == seeded.OwnerId));
        await db.SaveChangesAsync();
    }

    [DbFact]
    public async Task A_live_match_cannot_be_claimed()
    {
        await AuthTestDb.EnsureSchemaAsync();
        var db = AuthTestDb.OpenDb();
        var seeded = await SeedAsync(db, MatchStatus.LIVE, seats: 1, players: 1);

        try
        {
            var service = ServiceFor(db, new ClaimAttemptLimiter());
            var error = await Assert.ThrowsAsync<CodeError>(
                () => service.ClaimSeatAsync(seeded.UserIds[0].ToString(), Code));
            Assert.Equal(CodeErrorCode.CONFLICT, error.Code);
        }
        finally
        {
            await RemoveAsync(db, seeded);
        }
    }

    [DbFact]
    public async Task A_finished_match_cannot_be_claimed()
    {
        await AuthTestDb.EnsureSchemaAsync();
        var db = AuthTestDb.OpenDb();
        var seeded = await SeedAsync(db, MatchStatus.FINISHED, seats: 1, players: 1);

        try
        {
            var service = ServiceFor(db, new ClaimAttemptLimiter());
            var error = await Assert.ThrowsAsync<CodeError>(
                () => service.ClaimSeatAsync(seeded.UserIds[0].ToString(), Code));
            Assert.Equal(CodeErrorCode.CONFLICT, error.Code);
        }
        finally
        {
            await RemoveAsync(db, seeded);
        }
    }

    [DbFact]
    public async Task Only_one_of_two_concurrent_claims_fits_the_last_seat()
    {
        await AuthTestDb.EnsureSchemaAsync();
        var admin = AuthTestDb.OpenDb();
        var seeded = await SeedAsync(admin, MatchStatus.UPCOMING, seats: 1, players: 2);
        var limiter = new ClaimAttemptLimiter();

        try
        {
            async Task<bool> TryClaimAsync(Guid userId)
            {
                var db = AuthTestDb.OpenDb();
                try
                {
                    await ServiceFor(db, limiter).ClaimSeatAsync(userId.ToString(), Code);
                    return true;
                }
                catch (CodeError)
                {
                    return false;
                }
                finally
                {
                    await db.DisposeAsync();
                }
            }

            var results = await Task.WhenAll(
                TryClaimAsync(seeded.UserIds[0]), TryClaimAsync(seeded.UserIds[1]));

            Assert.Single(results, true);

            var row = await admin.Matches.AsNoTracking().FirstAsync(m => m.Id == seeded.MatchId);
            Assert.Single(row.PlayersList);
        }
        finally
        {
            await RemoveAsync(admin, seeded);
        }
    }

    [DbFact]
    public async Task Repeated_bad_codes_lock_the_account_out()
    {
        await AuthTestDb.EnsureSchemaAsync();
        var db = AuthTestDb.OpenDb();
        var seeded = await SeedAsync(db, MatchStatus.UPCOMING, seats: 1, players: 1);
        var limiter = new ClaimAttemptLimiter();
        var service = ServiceFor(db, limiter);
        var userId = seeded.UserIds[0].ToString();

        try
        {
            for (var attempt = 0; attempt < 5; attempt++)
            {
                var error = await Assert.ThrowsAsync<CodeError>(
                    () => service.ClaimSeatAsync(userId, "WRONG1"));
                Assert.Equal(CodeErrorCode.NOT_FOUND, error.Code);
            }

            var locked = await Assert.ThrowsAsync<CodeError>(
                () => service.ClaimSeatAsync(userId, "WRONG1"));
            Assert.Equal(CodeErrorCode.CONFLICT, locked.Code);
        }
        finally
        {
            await RemoveAsync(db, seeded);
        }
    }

    [DbFact]
    public async Task A_rotated_code_expires_after_the_configured_ttl()
    {
        await AuthTestDb.EnsureSchemaAsync();
        var db = AuthTestDb.OpenDb();
        var seeded = await SeedAsync(db, MatchStatus.UPCOMING, seats: 1, players: 1);
        var service = new MatchCodesService(db, new ClaimAttemptLimiter(), new MatchCodesOptions(30 * 60 * 1000));

        try
        {
            var room = await service.RotateRoomCodeAsync(
                seeded.TournamentId.ToString(), seeded.MatchId.ToString(), seeded.OwnerId);

            var ttl = room.ExpiresAt - DateTime.UtcNow;
            Assert.InRange(ttl.TotalMinutes, 29, 30);
        }
        finally
        {
            await RemoveAsync(db, seeded);
        }
    }
}
