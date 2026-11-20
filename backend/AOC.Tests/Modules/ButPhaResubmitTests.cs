using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using AOC.Api.Http;
using AOC.Api.Modules.Live;
using AOC.Api.Realtime;
using AOC.Domain.Contracts;
using AOC.Domain.Gameplay;
using AOC.Domain.Gameplay.Turns;
using AOC.Infrastructure.Audit;
using AOC.Infrastructure.Data;
using AOC.Infrastructure.Data.Entities;
using AOC.Tests.Auth;
using Xunit;

namespace AOC.Tests.Modules;

public class ButPhaResubmitTests
{
    private static bool Ready => AuthTestDb.DatabaseReady();

    private static string Iso(DateTime at) =>
        at.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ");

    private sealed record Fixture(
        Guid MatchId,
        Guid UserId,
        Guid QuestionId,
        AOCDbContext Db,
        SubmitService Submit);

    private static async Task<Fixture> SeedAsync(DateTime clockStartedAt, bool judged = false)
    {
        await AuthTestDb.EnsureSchemaAsync();
        var db = AuthTestDb.OpenDb();

        var now = DateTime.UtcNow;
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
            Name = "Resubmit cup",
            Slug = Guid.NewGuid().ToString("N")[..12],
            OwnerId = userId,
            Rounds = JsonDefaults.Serialize(new[]
            {
                new TournamentRound { Id = "but-pha", Name = "Bứt phá", Order = 2, Chart = "bars" }
            }),
            Format = JsonDefaults.Serialize(new { }),
            Stages = JsonDefaults.Serialize(new object[] { }),
            CreatedAt = now,
            UpdatedAt = now
        });
        await db.SaveChangesAsync();

        var questions = Enumerable.Range(1, 4).Select(i => new MatchQuestion
        {
            Id = i == 1 ? questionId.ToString() : Guid.NewGuid().ToString(),
            RoundId = "but-pha",
            TurnId = "phase1",
            Position = i - 1,
            Mode = QuestionMode.text,
            Kind = QuestionKind.TEXT,
            QuestionText = $"Thủ đô của Việt Nam là? ({i})",
            Points = 10,
            Payload = new QuestionPayload.Text(["Hà Nội"]),
            SourceId = Guid.NewGuid().ToString()
        }).ToList();

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
            Questions = JsonDefaults.Serialize(questions),
            CreatedAt = now,
            UpdatedAt = now
        });
        await db.SaveChangesAsync();

        var state = JsonSerializer.SerializeToElement(new ButPhaState
        {
            QuestionIds = questions.Select(q => q.Id).ToList(),
            QuestionRevealedAt = Iso(clockStartedAt),
            QuestionOpenedAt = Iso(clockStartedAt)
        }, JsonApi.Options);

        db.MatchLive.Add(new MatchLiveEntity
        {
            MatchId = matchId,
            Version = 1,
            RoundId = "but-pha",
            State = state,
            Archive = JsonSerializer.SerializeToElement(new { }),
            UpdatedAt = now
        });

        if (judged)
        {
            db.Answers.Add(new AnswerEntity
            {
                MatchId = matchId,
                QuestionId = questionId,
                UserId = userId,
                Value = JsonSerializer.SerializeToElement(
                    new SubmittedAnswerValue.Text("cũ"), JsonApi.Options),
                Judged = true,
                Verdict = Verdict.INCORRECT,
                FirstAnsweredMs = 1000,
                AnsweredMs = 1000,
                SubmittedAt = now
            });
        }

        await db.SaveChangesAsync();

        var hub = new MatchHubRegistry(NullLogger<MatchHubRegistry>.Instance);
        var audit = new AuditService(db, NullLogger<AuditService>.Instance);
        var submit = new SubmitService(db, new LiveReader(db), new DraftWriter(db), hub, audit);
        return new Fixture(matchId, userId, questionId, db, submit);
    }

    private static SubmitService.SubmitContext Ctx(Fixture f, string text) =>
        new(f.MatchId, f.UserId, f.QuestionId,
            JsonSerializer.SerializeToElement(
                new SubmittedAnswerValue.Text(text), JsonApi.Options));

    [Fact]
    public async Task SecondSubmit_WithinTheWindow_KeepsTheLastAnswer()
    {
        if (!Ready) return;
        var f = await SeedAsync(DateTime.UtcNow.AddSeconds(-3));

        await f.Submit.SubmitAnswerAsync(Ctx(f, "sai hoàn toàn"));
        await f.Submit.SubmitAnswerAsync(Ctx(f, "Hà Nội"));

        var row = Assert.Single(f.Db.Answers.AsNoTracking().Where(a => a.MatchId == f.MatchId));
        var value = row.Value.Deserialize<SubmittedAnswerValue>(JsonApi.Options);
        Assert.Equal("Hà Nội", Assert.IsType<SubmittedAnswerValue.Text>(value).Value);
        Assert.False(row.Judged);
        Assert.True(row.AnsweredMs >= row.FirstAnsweredMs);
    }

    [Fact]
    public async Task SecondSubmit_GetsTheFreshAutoSuggestion()
    {
        if (!Ready) return;
        var f = await SeedAsync(DateTime.UtcNow.AddSeconds(-3));

        await f.Submit.SubmitAnswerAsync(Ctx(f, "sai hoàn toàn"));
        await f.Submit.SubmitAnswerAsync(Ctx(f, "Hà Nội"));

        var row = Assert.Single(f.Db.Answers.AsNoTracking().Where(a => a.MatchId == f.MatchId));
        var drafts = row.Drafts!.Value.Deserialize<Dictionary<string, Verdict>>(JsonApi.Options)!;
        Assert.Equal(Verdict.CORRECT, drafts[DraftWriter.AutoDrafter]);
    }

    [Fact]
    public async Task Submit_AfterTheClockRanOut_IsStillRefused()
    {
        if (!Ready) return;
        var f = await SeedAsync(DateTime.UtcNow.AddSeconds(-45));

        var error = await Assert.ThrowsAsync<SubmitError>(() =>
            f.Submit.SubmitAnswerAsync(Ctx(f, "Hà Nội")));
        Assert.Equal("WINDOW_CLOSED", error.Code);
    }

    [Fact]
    public async Task Submit_AfterTheAnswerWasJudged_IsStillRefused()
    {
        if (!Ready) return;
        var f = await SeedAsync(DateTime.UtcNow.AddSeconds(-3), judged: true);

        var error = await Assert.ThrowsAsync<RuleError>(() =>
            f.Submit.SubmitAnswerAsync(Ctx(f, "đổi đáp án")));
        Assert.Equal("ALREADY_JUDGED", error.Code);
    }
}
