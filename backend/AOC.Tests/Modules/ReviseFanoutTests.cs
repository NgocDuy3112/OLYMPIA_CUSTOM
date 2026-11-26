using System.Text.Json;
using Microsoft.EntityFrameworkCore;
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

public class ReviseFanoutTests
{
    private static string Iso(DateTime at) =>
        at.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ");

    private sealed record Seeded(Guid MatchId, Guid UserId, Guid QuestionId, SubmitService Submit,
        MatchHubRegistry Hub);

    private static async Task<Seeded> SeedAsync()
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
            Username = $"revise-{Guid.NewGuid():N}"[..16],
            DisplayName = "An",
            CreatedAt = now,
            UpdatedAt = now
        });
        await db.SaveChangesAsync();

        var tournamentId = Guid.NewGuid();
        db.Tournaments.Add(new TournamentEntity
        {
            Id = tournamentId,
            Name = "Revise cup",
            Slug = Guid.NewGuid().ToString("N")[..12],
            OwnerId = userId,
            Rounds = JsonDefaults.Serialize(new[]
            {
                new TournamentRound { Id = "but-pha", Name = "but-pha", Order = 1, Chart = "bars" }
            }),
            Format = JsonDefaults.Serialize(new { }),
            Stages = JsonDefaults.Serialize(new object[] { }),
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
            Players = JsonDefaults.Serialize(new[]
            {
                new Seat { Kind = "user", UserId = userId.ToString(), Seed = 0 }
            }),
            RoundConfigs = JsonDefaults.Serialize(new Dictionary<string, RoundConfig>()),
            Questions = JsonDefaults.Serialize(new[]
            {
                new MatchQuestion
                {
                    Id = questionId.ToString(),
                    RoundId = "but-pha",
                    TurnId = "phase1",
                    Position = 0,
                    Mode = QuestionMode.text,
                    Kind = QuestionKind.TEXT,
                    QuestionText = "Thủ đô của Việt Nam là?",
                    Points = 10,
                    Payload = new QuestionPayload.Text(["Hà Nội"]),
                    SourceId = Guid.NewGuid().ToString()
                }
            }),
            CreatedAt = now,
            UpdatedAt = now
        });
        await db.SaveChangesAsync();

        db.MatchLive.Add(new MatchLiveEntity
        {
            MatchId = matchId,
            Version = 1,
            RoundId = "but-pha",
            State = JsonSerializer.SerializeToElement(new ButPhaState
            {
                QuestionIds = [questionId.ToString()],
                QuestionRevealedAt = Iso(now.AddSeconds(-60)),
                Window = AnswerWindow.TypedEveryone(60).OpenFor(Iso(now), 60)
            }, JsonApi.Options),
            Archive = JsonSerializer.SerializeToElement(new { }),
            UpdatedAt = now
        });
        await db.SaveChangesAsync();

        var hub = new MatchHubRegistry(NullLogger<MatchHubRegistry>.Instance);
        var submit = new SubmitService(db, new LiveReader(db), new DraftWriter(db), hub,
            new DraftAuditStore(db, NullLogger<DraftAuditStore>.Instance));
        return new Seeded(matchId, userId, questionId, submit, hub);
    }

    private static SubmitService.SubmitContext Answer(Seeded seeded, string text)
        => new(seeded.MatchId, seeded.UserId, seeded.QuestionId,
            JsonSerializer.SerializeToElement(new SubmittedAnswerValue.Text(text), JsonApi.Options));

    private static async Task<int> AuditAttemptsAsync(Guid matchId)
    {
        using var db = AuthTestDb.OpenDb();
        var row = await db.AuditEvents.AsNoTracking()
            .SingleAsync(a => a.MatchId == matchId && a.Action == DraftAuditStore.Action);
        return row.Details!.Value.GetProperty("attempts").GetInt32();
    }

    private static async Task<int> AuditRowsAsync(Guid matchId)
    {
        using var db = AuthTestDb.OpenDb();
        return await db.AuditEvents.AsNoTracking()
            .CountAsync(a => a.MatchId == matchId && a.Action == DraftAuditStore.Action);
    }

    [DbFact]
    public async Task An_identical_resubmit_publishes_nothing_and_keeps_one_audit_row()
    {
        var seeded = await SeedAsync();
        var pushes = 0;
        seeded.Hub.Subscribe(seeded.MatchId.ToString(),
            new HubSubscriber(seeded.UserId.ToString(), () =>
            {
                pushes += 1;
                return Task.CompletedTask;
            }));

        await seeded.Submit.SubmitAnswerAsync(Answer(seeded, "Hà Nội"));
        await seeded.Submit.SubmitAnswerAsync(Answer(seeded, "Hà Nội"));

        Assert.Equal(1, pushes);
        Assert.Equal(1, await AuditRowsAsync(seeded.MatchId));
        Assert.Equal(1, await AuditAttemptsAsync(seeded.MatchId));
    }

    [DbFact]
    public async Task A_changed_resubmit_publishes_and_bumps_the_attempt_counter()
    {
        var seeded = await SeedAsync();
        var pushes = 0;
        seeded.Hub.Subscribe(seeded.MatchId.ToString(),
            new HubSubscriber(seeded.UserId.ToString(), () =>
            {
                pushes += 1;
                return Task.CompletedTask;
            }));

        await seeded.Submit.SubmitAnswerAsync(Answer(seeded, "Hà Nội"));
        await seeded.Submit.SubmitAnswerAsync(Answer(seeded, "Sài Gòn"));

        Assert.Equal(2, pushes);
        Assert.Equal(1, await AuditRowsAsync(seeded.MatchId));
        Assert.Equal(2, await AuditAttemptsAsync(seeded.MatchId));

        using var db = AuthTestDb.OpenDb();
        var stored = await db.Answers.AsNoTracking()
            .SingleAsync(a => a.MatchId == seeded.MatchId && a.UserId == seeded.UserId);
        Assert.Equal("Sài Gòn", Assert.IsType<AnswerValue.Text>(stored.ValueObject).Value);
    }
}
