using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using AOC.Api.Http;
using AOC.Api.Modules.Live;
using AOC.Api.Modules.Live.TieBreak;
using AOC.Api.Modules.Matches;
using AOC.Api.Modules.Questions;
using AOC.Api.Modules.Standings;
using AOC.Api.Realtime;
using AOC.Domain.Contracts;
using AOC.Domain.Gameplay;
using AOC.Infrastructure.Data;
using AOC.Infrastructure.Data.Entities;
using AOC.Tests.Auth;
using Xunit;

namespace AOC.Tests.Modules;

public class LiveHeartbeatTests
{
    private sealed record Seeded(Guid MatchId, Guid HolderId, Guid OtherId);

    private static LiveService Service(AOCDbContext db)
    {
        var hub = new MatchHubRegistry(NullLogger<MatchHubRegistry>.Instance);
        var matches = new MatchesService(
            db, new StandingsService(db), NullLogger<MatchesService>.Instance);
        var reader = new LiveReader(db);
        var tieBreak = new TieBreakService(db, new QuestionsService(db), reader, hub);
        return new LiveService(db, reader, hub, matches, tieBreak, NullLogger<LiveService>.Instance);
    }

    private static async Task<Seeded> SeedAsync()
    {
        await AuthTestDb.EnsureSchemaAsync();
        using var db = AuthTestDb.OpenDb();

        var now = DateTime.UtcNow;
        var holderId = Guid.NewGuid();
        var otherId = Guid.NewGuid();
        var tournamentId = Guid.NewGuid();
        var matchId = Guid.NewGuid();

        foreach (var (id, name) in new[] { (holderId, "Holder"), (otherId, "Other") })
        {
            db.Users.Add(new UserEntity
            {
                Id = id,
                Role = UserRole.OPERATOR,
                Username = $"beat-{Guid.NewGuid():N}"[..20],
                DisplayName = name,
                CreatedAt = now,
                UpdatedAt = now
            });
        }
        await db.SaveChangesAsync();

        db.Tournaments.Add(new TournamentEntity
        {
            Id = tournamentId,
            Name = "Heartbeat cup",
            Slug = Guid.NewGuid().ToString("N")[..12],
            Visibility = Visibility.PRIVATE,
            OwnerId = holderId,
            Rounds = JsonDefaults.Serialize(Array.Empty<TournamentRound>()),
            Format = JsonDefaults.Serialize(new TournamentFormat { CompetitorsPerMatch = 2 }),
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
            Status = MatchStatus.LIVE,
            Players = JsonDefaults.Serialize(Array.Empty<Seat>()),
            RoundConfigs = JsonDefaults.Serialize(new Dictionary<string, RoundConfig>()),
            Questions = JsonDefaults.Serialize(Array.Empty<MatchQuestion>()),
            ControllerId = holderId,
            ControllerHeartbeatAt = now.AddSeconds(-20),
            CreatedAt = now,
            UpdatedAt = now
        });
        await db.SaveChangesAsync();

        return new Seeded(matchId, holderId, otherId);
    }

    private static async Task<DateTime?> HeartbeatAtAsync(AOCDbContext db, Guid matchId)
    {
        db.ChangeTracker.Clear();
        return await db.Matches.AsNoTracking()
            .Where(m => m.Id == matchId)
            .Select(m => m.ControllerHeartbeatAt)
            .FirstAsync();
    }

    [Fact]
    public void The_lease_stays_fresh_for_ninety_seconds()
    {
        Assert.Equal(TimeSpan.FromSeconds(90), MatchControl.StaleAfter);
    }

    [DbFact]
    public async Task The_holder_renews_its_lease()
    {
        var seeded = await SeedAsync();

        using var db = AuthTestDb.OpenDb();
        var before = await HeartbeatAtAsync(db, seeded.MatchId);
        var controller = await Service(db).HeartbeatAsync(seeded.MatchId, seeded.HolderId);

        Assert.True(controller.Active);
        Assert.Equal(seeded.HolderId, controller.Id);
        var after = await HeartbeatAtAsync(db, seeded.MatchId);
        Assert.True(after > before);
    }

    [DbFact]
    public async Task A_non_holder_gets_a_conflict_instead_of_the_lease()
    {
        var seeded = await SeedAsync();

        using var db = AuthTestDb.OpenDb();
        var error = await Assert.ThrowsAsync<ApiException>(() =>
            Service(db).HeartbeatAsync(seeded.MatchId, seeded.OtherId));

        Assert.Equal(409, error.Status);
        Assert.Equal(seeded.HolderId, await db.Matches.AsNoTracking()
            .Where(m => m.Id == seeded.MatchId)
            .Select(m => m.ControllerId)
            .FirstAsync());
    }
}
