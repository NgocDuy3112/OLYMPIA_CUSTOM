using AOC.Api.Modules.Live;
using AOC.Domain.Contracts;
using AOC.Infrastructure.Data;
using AOC.Infrastructure.Data.Entities;
using AOC.Tests.Auth;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace AOC.Tests.Modules;

public class VerdictChangeTests
{
    private sealed record Seeded(
        AOCDbContext Db, Guid TournamentId, Guid MatchId, Guid QuestionId, Guid PlayerId);

    private static async Task<Seeded> SeedAsync(Verdict? verdict)
    {
        await AuthTestDb.EnsureSchemaAsync();
        var db = AuthTestDb.OpenDb();
        var now = DateTime.UtcNow;
        var ownerId = Guid.NewGuid();
        var tournamentId = Guid.NewGuid();
        var matchId = Guid.NewGuid();
        var questionId = Guid.NewGuid();
        var playerId = Guid.NewGuid();

        db.Users.AddRange(
            new UserEntity
            {
                Id = ownerId,
                Role = UserRole.OPERATOR,
                Username = "verdict-owner-" + Guid.NewGuid().ToString("N")[..8],
                DisplayName = "Owner",
                CreatedAt = now,
                UpdatedAt = now
            },
            new UserEntity
            {
                Id = playerId,
                Role = UserRole.PLAYER,
                Username = "verdict-player-" + Guid.NewGuid().ToString("N")[..8],
                DisplayName = "Player",
                CreatedAt = now,
                UpdatedAt = now
            });
        await db.SaveChangesAsync();

        db.Tournaments.Add(new TournamentEntity
        {
            Id = tournamentId,
            Name = "Verdict cup",
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
            Status = MatchStatus.LIVE,
            Players = JsonDefaults.Serialize(Array.Empty<Seat>()),
            RoundConfigs = JsonDefaults.Serialize(new Dictionary<string, RoundConfig>()),
            Questions = JsonDefaults.Serialize(Array.Empty<MatchQuestion>()),
            CreatedAt = now,
            UpdatedAt = now
        });
        await db.SaveChangesAsync();

        db.MatchLive.Add(new MatchLiveEntity
        {
            MatchId = matchId,
            Version = 1,
            RoundId = "khoi-dong",
            State = JsonDefaults.Serialize(new { ended = false }),
            Archive = JsonDefaults.EmptyObject,
            UpdatedAt = now
        });
        if (verdict is not null)
        {
            db.Answers.Add(new AnswerEntity
            {
                MatchId = matchId,
                QuestionId = questionId,
                UserId = playerId,
                Value = JsonDefaults.Serialize(new { text = "x" }),
                Verdict = verdict,
                PointsAwarded = 10
            });
        }
        await db.SaveChangesAsync();

        return new Seeded(db, tournamentId, matchId, questionId, playerId);
    }

    private static async Task<List<VerdictChange>> JudgeAsync(Seeded seeded, Verdict verdict)
    {
        var store = new PgLiveStore(seeded.Db, seeded.MatchId);
        await store.Transact(async tx =>
        {
            await tx.RecordFacts([new JudgeFact(
                seeded.QuestionId.ToString(), seeded.PlayerId.ToString(), verdict, 10)]);
            return true;
        });
        return store.VerdictChanges;
    }

    private static async Task RemoveAsync(Seeded seeded)
    {
        seeded.Db.Answers.RemoveRange(seeded.Db.Answers.Where(a => a.MatchId == seeded.MatchId));
        seeded.Db.MatchLive.RemoveRange(seeded.Db.MatchLive.Where(l => l.MatchId == seeded.MatchId));
        seeded.Db.RemoveRange(seeded.Db.Matches.Where(m => m.Id == seeded.MatchId));
        seeded.Db.Tournaments.RemoveRange(seeded.Db.Tournaments.Where(t => t.Id == seeded.TournamentId));
        seeded.Db.Users.RemoveRange(seeded.Db.Users.Where(u => u.Id == seeded.PlayerId));
        await seeded.Db.SaveChangesAsync();
        await seeded.Db.DisposeAsync();
    }

    [DbFact]
    public async Task The_first_verdict_is_not_a_change()
    {
        var seeded = await SeedAsync(verdict: null);

        try
        {
            Assert.Empty(await JudgeAsync(seeded, Verdict.CORRECT));

            var answer = await seeded.Db.Answers.AsNoTracking()
                .FirstAsync(a => a.MatchId == seeded.MatchId);
            Assert.Equal(Verdict.CORRECT, answer.Verdict);
        }
        finally
        {
            await RemoveAsync(seeded);
        }
    }

    [DbFact]
    public async Task Rejudging_to_the_same_verdict_is_not_a_change()
    {
        var seeded = await SeedAsync(Verdict.CORRECT);

        try
        {
            Assert.Empty(await JudgeAsync(seeded, Verdict.CORRECT));
        }
        finally
        {
            await RemoveAsync(seeded);
        }
    }

    [DbFact]
    public async Task Rejudging_to_the_other_verdict_reports_the_old_and_new_value()
    {
        var seeded = await SeedAsync(Verdict.CORRECT);

        try
        {
            var change = Assert.Single(await JudgeAsync(seeded, Verdict.INCORRECT));

            Assert.Equal("khoi-dong", change.RoundId);
            Assert.Equal(seeded.QuestionId.ToString(), change.QuestionId);
            Assert.Equal(seeded.PlayerId.ToString(), change.PlayerId);
            Assert.Equal(Verdict.CORRECT, change.Previous);
            Assert.Equal(Verdict.INCORRECT, change.Verdict);

            var details = JsonDefaults.Serialize(change);
            Assert.Equal("CORRECT", details.GetProperty("previous").GetString());
            Assert.Equal("INCORRECT", details.GetProperty("verdict").GetString());
        }
        finally
        {
            await RemoveAsync(seeded);
        }
    }
}
