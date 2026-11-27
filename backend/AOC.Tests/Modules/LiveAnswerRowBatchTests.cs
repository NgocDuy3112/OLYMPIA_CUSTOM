using System.Data.Common;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Logging.Abstractions;
using AOC.Api.Http;
using AOC.Api.Modules.Live;
using AOC.Api.Modules.Live.TieBreak;
using AOC.Api.Modules.Matches;
using AOC.Api.Modules.Questions.Reads;
using AOC.Api.Realtime;
using AOC.Domain.Contracts;
using AOC.Domain.Gameplay;
using AOC.Domain.Gameplay.Turns;
using AOC.Infrastructure.Data;
using AOC.Infrastructure.Data.Entities;
using AOC.Tests.Auth;
using Xunit;

namespace AOC.Tests.Modules;

public class LiveAnswerRowBatchTests
{
    private sealed class AnswerRowQueries : DbCommandInterceptor
    {
        private readonly List<string> commands = [];

        public IReadOnlyList<string> Commands
        {
            get { lock (commands) return commands.ToList(); }
        }

        public override InterceptionResult<DbDataReader> ReaderExecuting(
            DbCommand command, CommandEventData eventData, InterceptionResult<DbDataReader> result)
        {
            Record(command);
            return result;
        }

        public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(
            DbCommand command, CommandEventData eventData,
            InterceptionResult<DbDataReader> result, CancellationToken cancellationToken = default)
        {
            Record(command);
            return ValueTask.FromResult(result);
        }

        private void Record(DbCommand command)
        {
            if (!command.CommandText.Contains("AS \"PointsAwarded\"")) return;
            if (!command.CommandText.Contains("AS \"QuestionId\"")) return;
            lock (commands) commands.Add(command.CommandText);
        }
    }

    private static string Iso(DateTime at) =>
        at.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ");

    private sealed record Seeded(
        Guid TournamentId, Guid MatchId, Guid RevealedQuestionId, Guid OpenQuestionId, Guid[] UserIds);

    private static async Task<Seeded> SeedAsync(AOCDbContext db)
    {
        var now = DateTime.UtcNow;
        var tournamentId = Guid.NewGuid();
        var matchId = Guid.NewGuid();
        var ownerId = Guid.NewGuid();
        var firstUser = Guid.NewGuid();
        var secondUser = Guid.NewGuid();
        var revealedQuestionId = Guid.NewGuid();
        var openQuestionId = Guid.NewGuid();

        foreach (var (id, name) in new[] { (ownerId, "Owner"), (firstUser, "An"), (secondUser, "Bình") })
        {
            db.Users.Add(new UserEntity
            {
                Id = id,
                Role = id == ownerId ? UserRole.OPERATOR : UserRole.PLAYER,
                Username = $"{name}-{Guid.NewGuid():N}"[..16],
                DisplayName = name
            });
        }
        await db.SaveChangesAsync();

        db.Tournaments.Add(new TournamentEntity
        {
            Id = tournamentId,
            Name = "Answer rows cup",
            Slug = Guid.NewGuid().ToString("N")[..12],
            Visibility = Visibility.PRIVATE,
            OwnerId = ownerId,
            Rounds = JsonDefaults.Serialize(new[]
            {
                new TournamentRound { Id = "but-pha", Name = "Bứt phá", Order = 1, Chart = "bars" }
            }),
            Format = JsonDefaults.Serialize(new { }),
            Stages = JsonDefaults.Serialize(Array.Empty<object>()),
            CreatedAt = now,
            UpdatedAt = now
        });
        await db.SaveChangesAsync();

        var questions = new List<MatchQuestion>
        {
            new()
            {
                Id = revealedQuestionId.ToString(),
                RoundId = "but-pha",
                TurnId = "phase1",
                Position = 0,
                Mode = QuestionMode.text,
                Kind = QuestionKind.TEXT,
                QuestionText = "Câu đã lật",
                Points = 10,
                Payload = new QuestionPayload.Text(["một"]),
                SourceId = Guid.NewGuid().ToString()
            },
            new()
            {
                Id = openQuestionId.ToString(),
                RoundId = "but-pha",
                TurnId = "phase1",
                Position = 1,
                Mode = QuestionMode.text,
                Kind = QuestionKind.TEXT,
                QuestionText = "Câu đang mở",
                Points = 10,
                Payload = new QuestionPayload.Text(["hai"]),
                SourceId = Guid.NewGuid().ToString()
            }
        };

        db.Matches.Add(new MatchEntity
        {
            Id = matchId,
            TournamentId = tournamentId,
            StageId = "s1",
            ScheduledAt = now,
            Label = "Vòng 1",
            Status = MatchStatus.LIVE,
            Players = JsonDefaults.Serialize(new[]
            {
                new Seat { Kind = "user", UserId = firstUser.ToString(), Seed = 1 },
                new Seat { Kind = "user", UserId = secondUser.ToString(), Seed = 2 }
            }),
            RoundConfigs = JsonDefaults.Serialize(new Dictionary<string, RoundConfig>()),
            Questions = JsonDefaults.Serialize(questions),
            CreatedAt = now,
            UpdatedAt = now
        });
        await db.SaveChangesAsync();

        db.MatchLive.Add(new MatchLiveEntity
        {
            MatchId = matchId,
            Version = 3,
            RoundId = "but-pha",
            State = JsonSerializer.SerializeToElement(new ButPhaState
            {
                QuestionIds = questions.Select(q => q.Id).ToList(),
                Cursor = 1,
                QuestionRevealedAt = Iso(now.AddSeconds(-90)),
                RevealedAnswer = revealedQuestionId.ToString(),
                Window = AnswerWindow.TypedEveryone(60).OpenFor(Iso(now), 60)
            }, JsonApi.Options),
            Archive = JsonSerializer.SerializeToElement(new { }, JsonApi.Options),
            UpdatedAt = now
        });

        db.Answers.AddRange(
            Answer(matchId, revealedQuestionId, firstUser, "một", Verdict.CORRECT, 10, now.AddSeconds(-80)),
            Answer(matchId, revealedQuestionId, secondUser, "một", Verdict.INCORRECT, 0, now.AddSeconds(-70)),
            Answer(matchId, openQuestionId, secondUser, "hai", null, null, now.AddSeconds(-20)),
            Answer(matchId, openQuestionId, firstUser, "hai", null, null, now.AddSeconds(-10)));
        await db.SaveChangesAsync();

        return new Seeded(tournamentId, matchId, revealedQuestionId, openQuestionId,
            [firstUser, secondUser]);
    }

    private static AnswerEntity Answer(
        Guid matchId, Guid questionId, Guid userId, string text,
        Verdict? verdict, int? points, DateTime submittedAt)
        => new()
        {
            MatchId = matchId,
            QuestionId = questionId,
            UserId = userId,
            Value = JsonSerializer.SerializeToElement(
                new SubmittedAnswerValue.Text(text), JsonApi.Options),
            Verdict = verdict,
            PointsAwarded = points,
            SubmittedAt = submittedAt,
            AnsweredMs = 1000
        };

    private static LiveService ServiceFor(AOCDbContext db)
    {
        var hub = new MatchHubRegistry(NullLogger<MatchHubRegistry>.Instance);
        var matches = new MatchesService(db, new MatchAssemblyService(db));
        var reader = new LiveReader(db);
        var tieBreak = new TieBreakService(db, new QuestionReadStore(db), reader, hub);
        return new LiveService(db, reader, hub, matches, tieBreak, NullLogger<LiveService>.Instance);
    }

    private static async Task RemoveAsync(AOCDbContext db, Seeded seeded)
    {
        db.Answers.RemoveRange(db.Answers.Where(a => a.MatchId == seeded.MatchId));
        db.MatchLive.RemoveRange(db.MatchLive.Where(l => l.MatchId == seeded.MatchId));
        await db.SaveChangesAsync();
        db.Matches.RemoveRange(db.Matches.Where(m => m.Id == seeded.MatchId));
        db.Tournaments.RemoveRange(db.Tournaments.Where(t => t.Id == seeded.TournamentId));
        await db.SaveChangesAsync();
        db.Users.RemoveRange(db.Users.Where(u => seeded.UserIds.Contains(u.Id)));
        await db.SaveChangesAsync();
    }

    private static string RowsOfAQuestion(AOCDbContext db, Guid matchId, Guid questionId)
        => JsonSerializer.SerializeToElement(db.Answers.AsNoTracking()
            .Where(a => a.MatchId == matchId && a.QuestionId == questionId)
            .OrderBy(a => a.SubmittedAt)
            .ThenBy(a => a.UserId)
            .AsEnumerable()
            .Select(a => new
            {
                questionId = a.QuestionId,
                userId = a.UserId,
                value = a.Value,
                verdict = a.Verdict,
                pointsAwarded = a.PointsAwarded,
                submittedAt = a.SubmittedAt,
                answeredMs = a.AnsweredMs
            }), JsonApi.Options).GetRawText();

    [DbFact]
    public async Task Console_answer_rows_of_a_question_match_a_per_question_read()
    {
        await AuthTestDb.EnsureSchemaAsync();
        using var db = AuthTestDb.OpenDb();
        var seeded = await SeedAsync(db);

        try
        {
            var console = await ServiceFor(db).ConsoleViewOfAsync(seeded.MatchId);
            Assert.NotNull(console);

            var rows = JsonSerializer.SerializeToElement(console.Projection["answers"], JsonApi.Options);
            var byQuestion = rows.EnumerateArray()
                .GroupBy(row => row.GetProperty("questionId").GetString())
                .ToDictionary(group => group.Key!, group => group.ToList());

            foreach (var questionId in new[] { seeded.RevealedQuestionId, seeded.OpenQuestionId })
            {
                Assert.Equal(
                    RowsOfAQuestion(db, seeded.MatchId, questionId),
                    JsonSerializer.SerializeToElement(
                        byQuestion[questionId.ToString()], JsonApi.Options).GetRawText());
            }
        }
        finally
        {
            await RemoveAsync(db, seeded);
        }
    }

    [DbFact]
    public async Task Console_answer_rows_keep_the_question_order_of_the_round()
    {
        await AuthTestDb.EnsureSchemaAsync();
        using var db = AuthTestDb.OpenDb();
        var seeded = await SeedAsync(db);

        try
        {
            var console = await ServiceFor(db).ConsoleViewOfAsync(seeded.MatchId);
            Assert.NotNull(console);

            var questionIds = JsonSerializer
                .SerializeToElement(console.Projection["answers"], JsonApi.Options)
                .EnumerateArray()
                .Select(row => row.GetProperty("questionId").GetString())
                .ToList();

            var revealed = seeded.RevealedQuestionId.ToString();
            var open = seeded.OpenQuestionId.ToString();

            Assert.Equal([revealed, revealed, open, open], questionIds);
        }
        finally
        {
            await RemoveAsync(db, seeded);
        }
    }

    [DbFact]
    public async Task Audience_and_console_agree_on_the_answer_rows()
    {
        await AuthTestDb.EnsureSchemaAsync();
        using var db = AuthTestDb.OpenDb();
        var seeded = await SeedAsync(db);

        try
        {
            var service = ServiceFor(db);
            var console = await service.ConsoleViewOfAsync(seeded.MatchId);
            var audience = await service.AudienceViewOfAsync(seeded.MatchId);

            Assert.NotNull(console);
            Assert.NotNull(audience);
            Assert.False(audience.Projection.ContainsKey("answers"));

            var again = await service.ConsoleViewOfAsync(seeded.MatchId);
            Assert.NotNull(again);
            Assert.Equal(
                JsonSerializer.SerializeToElement(console.Projection["answers"], JsonApi.Options).GetRawText(),
                JsonSerializer.SerializeToElement(again.Projection["answers"], JsonApi.Options).GetRawText());
        }
        finally
        {
            await RemoveAsync(db, seeded);
        }
    }

    [DbFact]
    public async Task Console_view_reads_the_answer_rows_of_the_round_in_one_query()
    {
        await AuthTestDb.EnsureSchemaAsync();
        var seededDb = AuthTestDb.OpenDb();
        var seeded = await SeedAsync(seededDb);

        var counter = new AnswerRowQueries();
        var options = new DbContextOptionsBuilder<AOCDbContext>()
            .Configure(AuthTestDb.ConnectionString())
            .AddInterceptors(counter)
            .Options;

        try
        {
            using var counted = new AOCDbContext(options);
            var console = await ServiceFor(counted).ConsoleViewOfAsync(seeded.MatchId);
            Assert.NotNull(console);

            var query = Assert.Single(counter.Commands);
            Assert.Contains("ANY", query);
        }
        finally
        {
            await RemoveAsync(seededDb, seeded);
            await seededDb.DisposeAsync();
        }
    }
}
