using Microsoft.EntityFrameworkCore;
using AOC.Api.Modules.Tournaments;
using AOC.Domain.Contracts;
using AOC.Infrastructure.Data;
using AOC.Infrastructure.Data.Entities;
using AOC.Tests.Auth;
using Xunit;

namespace AOC.Tests.Modules;

public class TournamentLifecycleTests
{
    private sealed record Seeded(Guid TournamentId, Guid OwnerId);

    private static async Task<Seeded> SeedAsync(AOCDbContext db)
    {
        var now = DateTime.UtcNow;
        var ownerId = Guid.NewGuid();
        var tournamentId = Guid.NewGuid();

        db.Users.Add(new UserEntity
        {
            Id = ownerId,
            Role = UserRole.ADMIN,
            Username = "lifecycle-" + Guid.NewGuid().ToString("N")[..8],
            DisplayName = "Owner",
            CreatedAt = now,
            UpdatedAt = now
        });
        await db.SaveChangesAsync();

        db.Tournaments.Add(new TournamentEntity
        {
            Id = tournamentId,
            Name = "Lifecycle cup",
            Slug = Guid.NewGuid().ToString("N")[..12],
            Visibility = Visibility.PRIVATE,
            OwnerId = ownerId,
            Current = true,
            Rounds = JsonDefaults.Serialize(Array.Empty<TournamentRound>()),
            Format = JsonDefaults.Serialize(new TournamentFormat { CompetitorsPerMatch = 4 }),
            Stages = JsonDefaults.Serialize(Array.Empty<object>()),
            CreatedAt = now,
            UpdatedAt = now
        });
        await db.SaveChangesAsync();

        return new Seeded(tournamentId, ownerId);
    }

    private static async Task AddMatchAsync(AOCDbContext db, Guid tournamentId, MatchStatus status,
        bool deleted = false)
    {
        var now = DateTime.UtcNow;
        db.Matches.Add(new MatchEntity
        {
            Id = Guid.NewGuid(),
            TournamentId = tournamentId,
            StageId = "s1",
            ScheduledAt = now,
            Label = "Vòng 1",
            Status = status,
            Players = JsonDefaults.Serialize(Array.Empty<Seat>()),
            RoundConfigs = JsonDefaults.Serialize(new Dictionary<string, RoundConfig>()),
            Questions = JsonDefaults.Serialize(Array.Empty<MatchQuestion>()),
            CreatedAt = now,
            UpdatedAt = now,
            DeletedAt = deleted ? now : null
        });
        await db.SaveChangesAsync();
    }

    [DbFact]
    public async Task Close_refuses_while_a_match_is_LIVE()
    {
        await AuthTestDb.EnsureSchemaAsync();
        using var db = AuthTestDb.OpenDb();
        var seeded = await SeedAsync(db);
        await AddMatchAsync(db, seeded.TournamentId, MatchStatus.LIVE);

        var service = new TournamentsService(db);
        var error = await CaptureAsync(() => service.CloseTournamentAsync(seeded.TournamentId.ToString()));

        Assert.Equal(409, error.Status);
        Assert.Equal(TournamentErrorCode.CONFLICT, error.Code);
        Assert.Contains("LIVE", error.Message);

        db.ChangeTracker.Clear();
        var row = await db.Tournaments.AsNoTracking().FirstAsync(t => t.Id == seeded.TournamentId);
        Assert.Null(row.ClosedAt);
        Assert.True(row.Current);
    }

    [DbFact]
    public async Task Close_sets_ClosedAt_and_clears_Current()
    {
        await AuthTestDb.EnsureSchemaAsync();
        using var db = AuthTestDb.OpenDb();
        var seeded = await SeedAsync(db);
        await AddMatchAsync(db, seeded.TournamentId, MatchStatus.FINISHED);

        var service = new TournamentsService(db);
        var row = await service.CloseTournamentAsync(seeded.TournamentId.ToString());

        Assert.NotNull(row.ClosedAt);
        Assert.False(row.Current);

        db.ChangeTracker.Clear();
        var stored = await db.Tournaments.AsNoTracking().FirstAsync(t => t.Id == seeded.TournamentId);
        Assert.NotNull(stored.ClosedAt);
        Assert.False(stored.Current);
    }

    [DbFact]
    public async Task Close_rejects_a_tournament_that_is_already_closed()
    {
        await AuthTestDb.EnsureSchemaAsync();
        using var db = AuthTestDb.OpenDb();
        var seeded = await SeedAsync(db);

        var service = new TournamentsService(db);
        await service.CloseTournamentAsync(seeded.TournamentId.ToString());
        var error = await CaptureAsync(() => service.CloseTournamentAsync(seeded.TournamentId.ToString()));

        Assert.Equal(409, error.Status);
        Assert.Equal(TournamentErrorCode.CLOSED, error.Code);
    }

    [DbFact]
    public async Task Delete_refuses_while_non_deleted_matches_exist_and_reports_the_count()
    {
        await AuthTestDb.EnsureSchemaAsync();
        using var db = AuthTestDb.OpenDb();
        var seeded = await SeedAsync(db);
        await AddMatchAsync(db, seeded.TournamentId, MatchStatus.UPCOMING);
        await AddMatchAsync(db, seeded.TournamentId, MatchStatus.FINISHED);
        await AddMatchAsync(db, seeded.TournamentId, MatchStatus.UPCOMING, deleted: true);

        var service = new TournamentsService(db);
        var error = await CaptureAsync(() => service.DeleteTournamentAsync(seeded.TournamentId.ToString()));

        Assert.Equal(409, error.Status);
        Assert.Equal(TournamentErrorCode.CONFLICT, error.Code);
        Assert.Contains("2 match(es)", error.Message);

        db.ChangeTracker.Clear();
        var row = await db.Tournaments.AsNoTracking().FirstAsync(t => t.Id == seeded.TournamentId);
        Assert.Null(row.DeletedAt);
    }

    [DbFact]
    public async Task Delete_soft_deletes_once_every_match_is_deleted()
    {
        await AuthTestDb.EnsureSchemaAsync();
        using var db = AuthTestDb.OpenDb();
        var seeded = await SeedAsync(db);
        await AddMatchAsync(db, seeded.TournamentId, MatchStatus.FINISHED, deleted: true);

        var service = new TournamentsService(db);
        await service.DeleteTournamentAsync(seeded.TournamentId.ToString());

        db.ChangeTracker.Clear();
        var row = await db.Tournaments.AsNoTracking().FirstAsync(t => t.Id == seeded.TournamentId);
        Assert.NotNull(row.DeletedAt);
        Assert.False(row.Current);
    }

    private static async Task<TournamentError> CaptureAsync(Func<Task> action)
    {
        try
        {
            await action();
        }
        catch (TournamentError ex)
        {
            return ex;
        }
        throw new InvalidOperationException("expected a TournamentError");
    }
}
