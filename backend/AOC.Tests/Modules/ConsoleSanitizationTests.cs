using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;using AOC.Api.Http;
using AOC.Api.Modules.Live;
using AOC.Api.Modules.Live.TieBreak;
using AOC.Api.Modules.Matches;
using AOC.Api.Modules.Questions;
using AOC.Api.Modules.Questions.Reads;
using AOC.Api.Modules.Standings;
using AOC.Api.Realtime;
using AOC.Domain.Contracts;
using AOC.Domain.Gameplay;
using AOC.Domain.Gameplay.Turns;
using AOC.Infrastructure.Data;
using AOC.Infrastructure.Data.Entities;
using AOC.Tests.Auth;
using Xunit;

namespace AOC.Tests.Modules;

public class ConsoleSanitizationTests
{
    private static string Iso(DateTime at) =>
        at.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ");

    private sealed record Seeded(Guid TournamentId, Guid MatchId, Guid OpenQuestionId, Guid FutureQuestionId, Guid UserId);

    private static async Task<Seeded> SeedAsync(AOCDbContext db)
    {
        var now = DateTime.UtcNow;
        var tournamentId = Guid.NewGuid();
        var matchId = Guid.NewGuid();
        var ownerId = Guid.NewGuid();
        var userId = Guid.NewGuid();
        var openQuestionId = Guid.NewGuid();
        var futureQuestionId = Guid.NewGuid();

        db.Users.Add(new UserEntity
        {
            Id = ownerId,
            Role = UserRole.OPERATOR,
            Username = "owner-" + Guid.NewGuid().ToString("N")[..10],
            DisplayName = "Owner"
        });
        db.Users.Add(new UserEntity
        {
            Id = userId,
            Role = UserRole.PLAYER,
            Username = "player-" + Guid.NewGuid().ToString("N")[..10],
            DisplayName = "Player"
        });
        await db.SaveChangesAsync();

        db.Tournaments.Add(new TournamentEntity
        {
            Id = tournamentId,
            Name = "Console cup",
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
                Id = openQuestionId.ToString(),
                RoundId = "but-pha",
                TurnId = "phase1",
                Position = 0,
                Mode = QuestionMode.text,
                Kind = QuestionKind.TEXT,
                QuestionText = "Open question",
                Points = 10,
                Payload = new QuestionPayload.Text(["open-secret"]),
                SourceId = Guid.NewGuid().ToString()
            },
            new()
            {
                Id = futureQuestionId.ToString(),
                RoundId = "but-pha",
                TurnId = "phase1",
                Position = 1,
                Mode = QuestionMode.text,
                Kind = QuestionKind.TEXT,
                QuestionText = "Future question",
                Points = 10,
                Payload = new QuestionPayload.Text(["future-secret"]),
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
                new Seat { Kind = "user", UserId = userId.ToString(), Seed = 1 }
            }),
            RoundConfigs = JsonDefaults.Serialize(new Dictionary<string, RoundConfig>()),
            Questions = JsonDefaults.Serialize(questions),
            CreatedAt = now,
            UpdatedAt = now
        });
        await db.SaveChangesAsync();

        var state = JsonSerializer.SerializeToElement(new ButPhaState
        {
            QuestionIds = questions.Select(q => q.Id).ToList(),
            QuestionRevealedAt = Iso(now),
            Window = AnswerWindow.TypedEveryone(30).OpenFor(Iso(now), 30)
        }, JsonApi.Options);

        db.MatchLive.Add(new MatchLiveEntity
        {
            MatchId = matchId,
            Version = 1,
            RoundId = "but-pha",
            State = state,
            Archive = JsonSerializer.SerializeToElement(new { }, JsonApi.Options),
            UpdatedAt = now
        });

        db.Answers.Add(new AnswerEntity
        {
            MatchId = matchId,
            QuestionId = openQuestionId,
            UserId = userId,
            Value = JsonSerializer.SerializeToElement(new SubmittedAnswerValue.Text("open"), JsonApi.Options),
            SubmittedAt = now,
            AnsweredMs = 1000
        });
        db.Answers.Add(new AnswerEntity
        {
            MatchId = matchId,
            QuestionId = futureQuestionId,
            UserId = userId,
            Value = JsonSerializer.SerializeToElement(new SubmittedAnswerValue.Text("future"), JsonApi.Options),
            SubmittedAt = now,
            AnsweredMs = 1000
        });
        await db.SaveChangesAsync();

        return new Seeded(tournamentId, matchId, openQuestionId, futureQuestionId, userId);
    }

    private static LiveService ServiceFor(AOCDbContext db)
    {
        var hub = new MatchHubRegistry(NullLogger<MatchHubRegistry>.Instance);
        var matches = new MatchesService(
            db, new StandingsService(db), NullLogger<MatchesService>.Instance);
        var reader = new LiveReader(db);
        var tieBreak = new TieBreakService(db, new QuestionReadStore(db), reader, hub);
        return new LiveService(db, reader, hub, matches, tieBreak, NullLogger<LiveService>.Instance);
    }

    private static async Task RemoveAsync(AOCDbContext db, Seeded seeded)
    {        db.Answers.RemoveRange(db.Answers.Where(a => a.MatchId == seeded.MatchId));
        db.MatchLive.RemoveRange(db.MatchLive.Where(l => l.MatchId == seeded.MatchId));
        await db.SaveChangesAsync();
        db.Matches.RemoveRange(db.Matches.Where(m => m.Id == seeded.MatchId));
        db.Tournaments.RemoveRange(db.Tournaments.Where(t => t.Id == seeded.TournamentId));
        await db.SaveChangesAsync();
        db.Users.RemoveRange(db.Users.Where(u => u.Id == seeded.UserId));
        await db.SaveChangesAsync();
    }

    [DbFact]
    public async Task Console_keeps_the_open_question_and_sanitizes_the_rest()
    {
        await AuthTestDb.EnsureSchemaAsync();
        var db = AuthTestDb.OpenDb();
        var seeded = await SeedAsync(db);

        try
        {
            var console = await ServiceFor(db).ConsoleViewOfAsync(seeded.MatchId);
            Assert.NotNull(console);

            var open = console.Questions.Single(q => q.Id == seeded.OpenQuestionId.ToString());
            var future = console.Questions.Single(q => q.Id == seeded.FutureQuestionId.ToString());

            var openPayload = Assert.IsType<QuestionPayload.Text>(open.Payload);
            Assert.Equal(["open-secret"], openPayload.AcceptedAnswers);

            var futurePayload = Assert.IsType<QuestionPayload.Text>(future.Payload);
            Assert.Empty(futurePayload.AcceptedAnswers);
        }
        finally
        {
            await RemoveAsync(db, seeded);
        }
    }

    [DbFact]
    public async Task Console_answer_rows_cover_only_the_active_questions()
    {
        await AuthTestDb.EnsureSchemaAsync();
        var db = AuthTestDb.OpenDb();
        var seeded = await SeedAsync(db);

        try
        {
            var console = await ServiceFor(db).ConsoleViewOfAsync(seeded.MatchId);
            Assert.NotNull(console);

            var rows = JsonSerializer.SerializeToElement(console.Projection["answers"], JsonApi.Options);
            Assert.Equal(JsonValueKind.Array, rows.ValueKind);
            var questionIds = rows.EnumerateArray()
                .Select(row => row.GetProperty("questionId").GetString())
                .ToList();

            Assert.Contains(seeded.OpenQuestionId.ToString(), questionIds);
            Assert.DoesNotContain(seeded.FutureQuestionId.ToString(), questionIds);
        }
        finally
        {
            await RemoveAsync(db, seeded);
        }
    }

    [DbFact]
    public async Task Console_write_guard_rejects_a_reader_who_cannot_write()
    {
        await AuthTestDb.EnsureSchemaAsync();
        var db = AuthTestDb.OpenDb();
        var seeded = await SeedAsync(db);
        var stranger = new UserEntity
        {
            Id = Guid.NewGuid(),
            Role = UserRole.OPERATOR,
            Username = "stranger-" + Guid.NewGuid().ToString("N")[..10],
            DisplayName = "Stranger"
        };

        try
        {
            var tournament = await db.Tournaments.FirstAsync(t => t.Id == seeded.TournamentId);
            tournament.Visibility = Visibility.PUBLIC;
            await db.SaveChangesAsync();

            var http = ContextFor(db);
            var read = await LiveMatchGuard.RequirePortalAsync(
                http, seeded.TournamentId.ToString(), seeded.MatchId.ToString(), stranger);
            Assert.Equal(seeded.MatchId, read.Id);

            var error = await CaptureAsync(() => LiveMatchGuard.RequirePortalWriteAsync(
                http, seeded.TournamentId.ToString(), seeded.MatchId.ToString(), stranger));
            Assert.Equal(403, error.Status);
        }
        finally
        {
            await RemoveAsync(db, seeded);
        }
    }

    private static HttpContext ContextFor(AOCDbContext db)
    {
        var services = new ServiceCollection();
        services.AddSingleton(db);
        services.AddSingleton(new MatchesService(
            db, new StandingsService(db), NullLogger<MatchesService>.Instance));
        return new DefaultHttpContext { RequestServices = services.BuildServiceProvider() };
    }

    private static async Task<ApiException> CaptureAsync(Func<Task> fn)
    {
        try
        {
            await fn();
        }
        catch (ApiException ex)
        {
            return ex;
        }
        throw new InvalidOperationException("expected an ApiException");
    }
}
