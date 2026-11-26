using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using AOC.Api.Http;
using AOC.Api.Modules.Matches;
using AOC.Api.Modules.Standings;
using AOC.Domain.Contracts;
using AOC.Domain.Gameplay;
using AOC.Infrastructure.Data;
using AOC.Infrastructure.Data.Entities;
using AOC.Tests.Auth;
using Xunit;

namespace AOC.Tests.Modules;

public class MatchTransitionTests
{
    private sealed record Seeded(Guid TournamentId, Guid MatchId, Guid FirstPlayerId, Guid SecondPlayerId);

    private static async Task<Seeded> SeedAsync()
    {
        await AuthTestDb.EnsureSchemaAsync();
        using var db = AuthTestDb.OpenDb();

        var now = DateTime.UtcNow;
        var ownerId = Guid.NewGuid();
        var firstPlayerId = Guid.NewGuid();
        var secondPlayerId = Guid.NewGuid();
        var tournamentId = Guid.NewGuid();
        var matchId = Guid.NewGuid();

        foreach (var (id, name) in new[]
        {
            (ownerId, "Owner"), (firstPlayerId, "An"), (secondPlayerId, "Bình")
        })
        {
            db.Users.Add(new UserEntity
            {
                Id = id,
                Role = id == ownerId ? UserRole.ADMIN : UserRole.PLAYER,
                Username = $"trans-{Guid.NewGuid():N}"[..20],
                DisplayName = name,
                CreatedAt = now,
                UpdatedAt = now
            });
        }
        await db.SaveChangesAsync();

        db.Tournaments.Add(new TournamentEntity
        {
            Id = tournamentId,
            Name = "Transition cup",
            Slug = Guid.NewGuid().ToString("N")[..12],
            Visibility = Visibility.PRIVATE,
            OwnerId = ownerId,
            Rounds = JsonDefaults.Serialize(Array.Empty<TournamentRound>()),
            Format = JsonDefaults.Serialize(new TournamentFormat { CompetitorsPerMatch = 2 }),
            Stages = JsonDefaults.Serialize(new[] { new Stage { Id = "s1", Title = "Chung kết" } }),
            CreatedAt = now,
            UpdatedAt = now
        });
        await db.SaveChangesAsync();

        db.TournamentPlayers.Add(new TournamentPlayerEntity
        {
            TournamentId = tournamentId,
            UserId = firstPlayerId,
            EnrolledAt = now
        });
        db.TournamentPlayers.Add(new TournamentPlayerEntity
        {
            TournamentId = tournamentId,
            UserId = secondPlayerId,
            EnrolledAt = now
        });
        await db.SaveChangesAsync();

        db.Matches.Add(new MatchEntity
        {
            Id = matchId,
            TournamentId = tournamentId,
            StageId = "s1",
            ScheduledAt = now,
            Label = "Chung kết",
            Status = MatchStatus.LIVE,
            Players = JsonDefaults.Serialize(new[]
            {
                new Seat { Kind = "user", UserId = firstPlayerId.ToString(), Seed = 1 },
                new Seat { Kind = "user", UserId = secondPlayerId.ToString(), Seed = 2 }
            }),
            RoundConfigs = JsonDefaults.Serialize(new Dictionary<string, RoundConfig>()),
            Questions = JsonDefaults.Serialize(Array.Empty<MatchQuestion>()),
            CreatedAt = now,
            UpdatedAt = now
        });
        await db.SaveChangesAsync();

        db.Answers.Add(new AnswerEntity
        {
            MatchId = matchId,
            QuestionId = Guid.NewGuid(),
            UserId = firstPlayerId,
            Value = JsonSerializer.SerializeToElement(new AnswerValue.Text("Hà Nội"), JsonApi.Options),
            Verdict = Verdict.CORRECT,
            PointsAwarded = 40,
            SubmittedAt = now
        });
        db.Answers.Add(new AnswerEntity
        {
            MatchId = matchId,
            QuestionId = Guid.NewGuid(),
            UserId = secondPlayerId,
            Value = JsonSerializer.SerializeToElement(new AnswerValue.Text("Huế"), JsonApi.Options),
            Verdict = Verdict.INCORRECT,
            PointsAwarded = 10,
            SubmittedAt = now
        });
        await db.SaveChangesAsync();

        return new Seeded(tournamentId, matchId, firstPlayerId, secondPlayerId);
    }

    private static MatchesService Service(AOCDbContext db) =>
        new(db, new StandingsService(db), NullLogger<MatchesService>.Instance);

    [DbFact]
    public async Task Finishing_writes_results_and_standings_in_the_same_transaction()
    {
        var seeded = await SeedAsync();

        using var db = AuthTestDb.OpenDb();
        await Service(db).TransitionMatchAsync(
            seeded.TournamentId.ToString(), seeded.MatchId.ToString(), "FINISHED");

        db.ChangeTracker.Clear();
        var match = await db.Matches.AsNoTracking().FirstAsync(m => m.Id == seeded.MatchId);
        Assert.Equal(MatchStatus.FINISHED, match.Status);

        var result = await db.MatchResults.AsNoTracking().SingleAsync(r => r.MatchId == seeded.MatchId);
        Assert.Contains(seeded.FirstPlayerId.ToString(), result.Results.GetRawText());

        var standings = await db.TournamentStandings.AsNoTracking()
            .Where(s => s.TournamentId == seeded.TournamentId)
            .OrderBy(s => s.Rank)
            .ToListAsync();
        Assert.Equal(2, standings.Count);
        Assert.Equal(seeded.FirstPlayerId, standings[0].UserId);
        Assert.Equal(1, standings[0].Rank);
    }

    [DbFact]
    public async Task Two_concurrent_finish_presses_produce_one_result_and_no_error()
    {
        var seeded = await SeedAsync();

        using var first = AuthTestDb.OpenDb();
        using var second = AuthTestDb.OpenDb();

        await Task.WhenAll(
            Service(first).TransitionMatchAsync(
                seeded.TournamentId.ToString(), seeded.MatchId.ToString(), "FINISHED"),
            Service(second).TransitionMatchAsync(
                seeded.TournamentId.ToString(), seeded.MatchId.ToString(), "FINISHED"));

        using var check = AuthTestDb.OpenDb();
        var match = await check.Matches.AsNoTracking().FirstAsync(m => m.Id == seeded.MatchId);
        Assert.Equal(MatchStatus.FINISHED, match.Status);
        Assert.Equal(1, await check.MatchResults.CountAsync(r => r.MatchId == seeded.MatchId));
        Assert.Equal(2, await check.TournamentStandings.CountAsync(
            s => s.TournamentId == seeded.TournamentId));
    }

    [DbFact]
    public async Task A_failed_finish_leaves_the_match_live_and_writes_nothing()
    {
        var seeded = await SeedAsync();

        using var db = AuthTestDb.OpenDb();
        var pending = new AnswerEntity
        {
            MatchId = seeded.MatchId,
            QuestionId = Guid.NewGuid(),
            UserId = seeded.SecondPlayerId,
            Value = JsonSerializer.SerializeToElement(new AnswerValue.Text("Đà Nẵng"), JsonApi.Options),
            SubmittedAt = DateTime.UtcNow
        };
        db.Answers.Add(pending);
        await db.SaveChangesAsync();

        var error = await Assert.ThrowsAsync<MatchError>(() => Service(db).TransitionMatchAsync(
            seeded.TournamentId.ToString(), seeded.MatchId.ToString(), "FINISHED"));
        Assert.Equal(MatchErrorCode.NOT_READY, error.Code);

        db.ChangeTracker.Clear();
        var match = await db.Matches.AsNoTracking().FirstAsync(m => m.Id == seeded.MatchId);
        Assert.Equal(MatchStatus.LIVE, match.Status);
        Assert.False(await db.MatchResults.AnyAsync(r => r.MatchId == seeded.MatchId));
        Assert.False(await db.TournamentStandings.AnyAsync(s => s.TournamentId == seeded.TournamentId));
    }
}
