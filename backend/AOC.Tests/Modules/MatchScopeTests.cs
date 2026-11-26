using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using AOC.Api.Modules.Matches;
using AOC.Api.Modules.Standings;
using AOC.Domain.Contracts;
using AOC.Infrastructure.Data;
using AOC.Infrastructure.Data.Entities;
using AOC.Tests.Auth;
using Xunit;

namespace AOC.Tests.Modules;

public class MatchScopeTests
{
    private sealed record Seeded(Guid TournamentId, Guid MatchId, Guid OwnerId);

    private static async Task<Seeded> SeedAsync(AOCDbContext db)
    {
        var now = DateTime.UtcNow;
        var ownerId = Guid.NewGuid();
        var tournamentId = Guid.NewGuid();
        var matchId = Guid.NewGuid();

        db.Users.Add(new UserEntity
        {
            Id = ownerId,
            Role = UserRole.OPERATOR,
            Username = "scope-" + Guid.NewGuid().ToString("N")[..10],
            DisplayName = "Owner"
        });
        await db.SaveChangesAsync();

        db.Tournaments.Add(new TournamentEntity
        {
            Id = tournamentId,
            Name = "Scope cup",
            Slug = Guid.NewGuid().ToString("N")[..12],
            Visibility = Visibility.PRIVATE,
            OwnerId = ownerId,
            Rounds = JsonDefaults.Serialize(Array.Empty<TournamentRound>()),
            Format = JsonDefaults.Serialize(new { }),
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
            Status = MatchStatus.UPCOMING,
            Players = JsonDefaults.Serialize(Array.Empty<Seat>()),
            RoundConfigs = JsonDefaults.Serialize(new Dictionary<string, RoundConfig>()),
            Questions = JsonDefaults.Serialize(Array.Empty<MatchQuestion>()),
            CreatedAt = now,
            UpdatedAt = now
        });
        await db.SaveChangesAsync();

        return new Seeded(tournamentId, matchId, ownerId);
    }

    private static async Task RemoveAsync(AOCDbContext db, Seeded seeded)
    {
        db.Matches.RemoveRange(db.Matches.Where(m => m.Id == seeded.MatchId));
        db.Tournaments.RemoveRange(db.Tournaments.Where(t => t.Id == seeded.TournamentId));
        await db.SaveChangesAsync();
        db.Users.RemoveRange(db.Users.Where(u => u.Id == seeded.OwnerId));
        await db.SaveChangesAsync();
    }

    [DbFact]
    public async Task A_match_outside_the_tournament_is_rejected()
    {
        await AuthTestDb.EnsureSchemaAsync();
        var db = AuthTestDb.OpenDb();
        var seeded = await SeedAsync(db);
        var otherTournamentId = Guid.NewGuid();

        try
        {
            var service = new MatchesService(db, new MatchAssemblyService(db));

            await Assert.ThrowsAsync<MatchError>(() => service.RequireMatchScopeAsync(
                otherTournamentId.ToString(), seeded.MatchId.ToString()));
        }
        finally
        {
            await RemoveAsync(db, seeded);
        }
    }

    [DbFact]
    public async Task A_matching_pair_returns_both_rows()
    {
        await AuthTestDb.EnsureSchemaAsync();
        var db = AuthTestDb.OpenDb();
        var seeded = await SeedAsync(db);

        try
        {
            var service = new MatchesService(db, new MatchAssemblyService(db));
            var scope = await service.RequireMatchScopeAsync(
                seeded.TournamentId.ToString(), seeded.MatchId.ToString());

            Assert.Equal(seeded.TournamentId, scope.Tournament.Id);
            Assert.Equal(seeded.MatchId, scope.Match.Id);
        }
        finally
        {
            await RemoveAsync(db, seeded);
        }
    }
}
