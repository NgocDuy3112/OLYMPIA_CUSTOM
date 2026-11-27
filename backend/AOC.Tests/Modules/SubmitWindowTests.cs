using System.Text.Json;
using Microsoft.Extensions.Logging.Abstractions;
using AOC.Api.Http;
using AOC.Api.Modules.Live;
using AOC.Api.Realtime;
using AOC.Domain.Contracts;
using AOC.Domain.Gameplay.Turns;
using AOC.Infrastructure.Data;
using AOC.Infrastructure.Data.Entities;
using AOC.Tests.Auth;
using Xunit;

namespace AOC.Tests.Modules;

public class SubmitWindowTests
{
    private static string Iso(DateTime at) =>
        at.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ");

    private sealed record Fixture(Guid MatchId, Guid UserId, Guid QuestionId, SubmitService Submit);

    private static object StateFor(string roundId, string userId, string questionId, DateTime now)
    {
        var started = Iso(now.AddSeconds(-60));
        return roundId switch
        {
            "giai-ma" => new GiaiMaState
            {
                Players = [new GiaiMaPlayer { Id = userId }],
                OpenHint = questionId,
                HintWindow = AnswerWindow.TypedEveryone(15).OpenFor(started, 15)
            },
            "but-pha" => new ButPhaState
            {
                QuestionIds = [questionId],
                QuestionRevealedAt = started,
                Window = AnswerWindow.TypedEveryone(30).OpenFor(started, 30)
            },
            "khoi-dong" => new KhoiDongState
            {
                Flow = Flow.chung,
                Order = [userId],
                Phase2 = new Phase2State
                {
                    QuestionIds = [questionId],
                    Index = 0,
                    Window = AnswerWindow.TypedEveryone(10).OpenFor(started, 10)
                }
            },
            "ve-dich" => new VeDichState
            {
                Phase = 1,
                Players = [new VeDichPlayerState { Id = userId }],
                Open = new OpenQuestion
                {
                    Question = new VeDichQuestion { Id = questionId, Value = 20 },
                    Answerer = userId,
                    Window = AnswerWindow.OralCurrentTurn(userId).OpenFor(started, 30),
                    Revealed = true
                }
            },
            _ => throw new ArgumentOutOfRangeException(nameof(roundId))
        };
    }

    private static async Task<Dictionary<string, Fixture>> SeedAsync(string[] roundIds)
    {
        await AuthTestDb.EnsureSchemaAsync();
        var db = AuthTestDb.OpenDb();

        var now = DateTime.UtcNow;
        var hub = new MatchHubRegistry(NullLogger<MatchHubRegistry>.Instance);
        var audit = new DraftAuditStore(db, NullLogger<DraftAuditStore>.Instance);
        var submit = new SubmitService(db, new LiveReader(db), new DraftWriter(db), hub, audit);
        var fixtures = new Dictionary<string, Fixture>();

        foreach (var roundId in roundIds)
        {
            var userId = Guid.NewGuid();
            var questionId = Guid.NewGuid();
            var matchId = Guid.NewGuid();

            db.Users.Add(new UserEntity
            {
                Id = userId,
                Role = UserRole.PLAYER,
                Username = $"p-{Guid.NewGuid():N}"[..16],
                Email = $"{Guid.NewGuid():N}@test.local",
                DisplayName = "An",
                CreatedAt = now,
                UpdatedAt = now
            });
            await db.SaveChangesAsync();

            var tournamentId = Guid.NewGuid();
            db.Tournaments.Add(new TournamentEntity
            {
                Id = tournamentId,
                Name = "Window cup",
                Slug = Guid.NewGuid().ToString("N")[..12],
                OwnerId = userId,
                Rounds = JsonDefaults.Serialize(new[]
                {
                    new TournamentRound { Id = roundId, Name = roundId, Order = 1, Chart = "bars" }
                }),
                Format = JsonDefaults.Serialize(new { }),
                Stages = JsonDefaults.Serialize(new object[] { }),
                CreatedAt = now,
                UpdatedAt = now
            });
            await db.SaveChangesAsync();

            var question = new MatchQuestion
            {
                Id = questionId.ToString(),
                RoundId = roundId,
                TurnId = "phase1",
                Position = 0,
                Mode = QuestionMode.text,
                Kind = QuestionKind.TEXT,
                QuestionText = "Thủ đô của Việt Nam là?",
                Points = 10,
                Payload = new QuestionPayload.Text(["Hà Nội"]),
                SourceId = Guid.NewGuid().ToString()
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
                    new Seat { Kind = "user", UserId = userId.ToString(), Seed = 0 }
                }),
                RoundConfigs = JsonDefaults.Serialize(new Dictionary<string, RoundConfig>()),
                Questions = JsonDefaults.Serialize(new[] { question }),
                CreatedAt = now,
                UpdatedAt = now
            });
            await db.SaveChangesAsync();

            db.MatchLive.Add(new MatchLiveEntity
            {
                MatchId = matchId,
                Version = 1,
                RoundId = roundId,
                State = JsonSerializer.SerializeToElement(
                    StateFor(roundId, userId.ToString(), questionId.ToString(), now), JsonApi.Options),
                Archive = JsonSerializer.SerializeToElement(new { }),
                UpdatedAt = now
            });
            await db.SaveChangesAsync();

            fixtures[roundId] = new Fixture(matchId, userId, questionId, submit);
        }

        return fixtures;
    }

    private static async Task<string> ClosedWindowCodeAsync(Fixture f)
    {
        var ctx = new SubmitService.SubmitContext(
            f.MatchId, f.UserId, f.QuestionId,
            JsonSerializer.SerializeToElement(
                new SubmittedAnswerValue.Text("Hà Nội"), JsonApi.Options));

        var error = await Assert.ThrowsAsync<SubmitError>(() => f.Submit.SubmitAnswerAsync(ctx));
        return error.Code;
    }

    [DbFact]
    public async Task ClosedWindow_ReturnsTheSameCodeForEveryRound()
    {

        var fixtures = await SeedAsync(["giai-ma", "but-pha", "khoi-dong", "ve-dich"]);

        var codes = new[]
        {
            await ClosedWindowCodeAsync(fixtures["giai-ma"]),
            await ClosedWindowCodeAsync(fixtures["but-pha"]),
            await ClosedWindowCodeAsync(fixtures["khoi-dong"]),
            await ClosedWindowCodeAsync(fixtures["ve-dich"])
        };

        Assert.Single(codes.Distinct());
        Assert.All(codes, code => Assert.Equal("WINDOW_CLOSED", code));
    }

    [DbFact]
    public async Task GiaiMa_Second_hint_opens_and_takes_an_answer_after_the_first_clock_ran_out()
    {
        var fixture = (await SeedAsync(["giai-ma"]))["giai-ma"];
        using var db = AuthTestDb.OpenDb();

        var playerId = fixture.UserId.ToString();
        var firstHint = fixture.QuestionId.ToString();
        var match = db.Matches.Single(m => m.Id == fixture.MatchId);
        var secondHint = Guid.NewGuid().ToString();
        var questions = match.QuestionsList;
        questions.Add(new MatchQuestion
        {
            Id = secondHint,
            RoundId = "giai-ma",
            TurnId = "phase1",
            Position = 1,
            Mode = QuestionMode.text,
            Kind = QuestionKind.TEXT,
            QuestionText = "Thành phố nào là thủ đô của Việt Nam?",
            Points = 10,
            Payload = new QuestionPayload.Text(["Hà Nội"]),
            SourceId = Guid.NewGuid().ToString()
        });
        match.Questions = JsonDefaults.Serialize(questions);
        await db.SaveChangesAsync();

        var now = DateTime.UtcNow;
        var state = GiaiMaTurn.StartWindow(
            GiaiMaTurn.PickHint(GiaiMaTurn.StartGiaiMa([playerId], [firstHint, secondHint]), firstHint),
            Iso(now.AddSeconds(-40)));
        state = GiaiMaTurn.ResolveOpenHint(state,
            new Dictionary<string, bool> { [playerId] = false });
        state = GiaiMaTurn.StartWindow(GiaiMaTurn.PickHint(state, secondHint), Iso(now.AddSeconds(-2)));

        var live = db.MatchLive.Single(l => l.MatchId == fixture.MatchId);
        live.State = JsonSerializer.SerializeToElement(state, JsonApi.Options);
        await db.SaveChangesAsync();

        await fixture.Submit.SubmitAnswerAsync(new SubmitService.SubmitContext(
            fixture.MatchId, fixture.UserId, Guid.Parse(secondHint),
            JsonSerializer.SerializeToElement(
                new SubmittedAnswerValue.Text("Hà Nội"), JsonApi.Options)));

        var stored = db.Answers.Single(a =>
            a.MatchId == fixture.MatchId && a.QuestionId == Guid.Parse(secondHint));
        Assert.Equal("Hà Nội", Assert.IsType<AnswerValue.Text>(stored.ValueObject).Value);
    }

    [DbFact]
    public async Task GiaiMa_Answer_lands_while_the_countdown_started_by_the_window_is_running()
    {
        var fixture = (await SeedAsync(["giai-ma"]))["giai-ma"];
        using var db = AuthTestDb.OpenDb();

        var playerId = fixture.UserId.ToString();
        var questionId = fixture.QuestionId.ToString();
        var state = GiaiMaTurn.StartWindow(
            GiaiMaTurn.PickHint(GiaiMaTurn.StartGiaiMa([playerId], [questionId]), questionId),
            Iso(DateTime.UtcNow.AddSeconds(-2)));

        var live = db.MatchLive.Single(l => l.MatchId == fixture.MatchId);
        live.State = JsonSerializer.SerializeToElement(state, JsonApi.Options);
        await db.SaveChangesAsync();

        await fixture.Submit.SubmitAnswerAsync(new SubmitService.SubmitContext(
            fixture.MatchId, fixture.UserId, fixture.QuestionId,
            JsonSerializer.SerializeToElement(
                new SubmittedAnswerValue.Text("Hà Nội"), JsonApi.Options)));

        var stored = db.Answers.Single(a => a.MatchId == fixture.MatchId && a.UserId == fixture.UserId);
        Assert.Equal("Hà Nội", Assert.IsType<AnswerValue.Text>(stored.ValueObject).Value);
    }

    [DbFact]
    public async Task PressedAt_drives_the_recorded_elapsed_time_not_the_server_clock()
    {
        var fixture = (await SeedAsync(["but-pha"]))["but-pha"];
        using var db = AuthTestDb.OpenDb();

        var openedAt = DateTimeOffset.UtcNow.AddSeconds(-5);
        var live = db.MatchLive.Single(l => l.MatchId == fixture.MatchId);
        var state = new ButPhaState
        {
            QuestionIds = [fixture.QuestionId.ToString()],
            QuestionRevealedAt = Iso(openedAt.UtcDateTime),
            Window = AnswerWindow.TypedEveryone(30).OpenFor(Iso(openedAt.UtcDateTime), 30)
        };
        live.State = JsonSerializer.SerializeToElement(state, JsonApi.Options);
        await db.SaveChangesAsync();

        var pressedAt = DateTimeOffset.UtcNow.AddMilliseconds(-1_000);
        var ctx = new SubmitService.SubmitContext(
            fixture.MatchId, fixture.UserId, fixture.QuestionId,
            JsonSerializer.SerializeToElement(
                new SubmittedAnswerValue.Text("Hà Nội"), JsonApi.Options),
            PressedAt: pressedAt);

        await fixture.Submit.SubmitAnswerAsync(ctx);

        var stored = db.Answers.Single(a => a.MatchId == fixture.MatchId && a.UserId == fixture.UserId);
        Assert.NotNull(stored.AnsweredMs);
        Assert.InRange(stored.AnsweredMs!.Value, 3_500, 4_500);
    }
}
