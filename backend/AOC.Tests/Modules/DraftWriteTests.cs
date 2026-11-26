using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using AOC.Api.Http;
using AOC.Api.Modules.Live;
using AOC.Domain.Contracts;
using AOC.Domain.Gameplay;
using AOC.Infrastructure.Data;
using AOC.Infrastructure.Data.Entities;
using AOC.Tests.Auth;
using Xunit;

namespace AOC.Tests.Modules;

public class DraftWriteTests
{
    private sealed record Seeded(Guid MatchId, Guid QuestionId, Guid UserId);

    private static async Task<Seeded> SeedAsync()
    {
        await AuthTestDb.EnsureSchemaAsync();
        using var db = AuthTestDb.OpenDb();

        var now = DateTime.UtcNow;
        var userId = Guid.NewGuid();
        var tournamentId = Guid.NewGuid();
        var matchId = Guid.NewGuid();
        var questionId = Guid.NewGuid();

        db.Users.Add(new UserEntity
        {
            Id = userId,
            Role = UserRole.PLAYER,
            Username = $"draft-{Guid.NewGuid():N}"[..16],
            DisplayName = "An",
            CreatedAt = now,
            UpdatedAt = now
        });
        await db.SaveChangesAsync();

        db.Tournaments.Add(new TournamentEntity
        {
            Id = tournamentId,
            Name = "Draft cup",
            Slug = Guid.NewGuid().ToString("N")[..12],
            OwnerId = userId,
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

        return new Seeded(matchId, questionId, userId);
    }

    private static JsonElement Answer(string text) =>
        JsonSerializer.SerializeToElement(new SubmittedAnswerValue.Text(text), JsonApi.Options);

    [DbFact]
    public async Task Two_concurrent_draft_writes_leave_one_row_and_raise_nothing()
    {
        var seeded = await SeedAsync();

        using var first = AuthTestDb.OpenDb();
        using var second = AuthTestDb.OpenDb();
        var firstWriter = new DraftWriter(first);
        var secondWriter = new DraftWriter(second);

        var write = Task.WhenAll(
            firstWriter.WriteDraftAsync(seeded.MatchId, seeded.QuestionId, seeded.UserId,
                Answer("Hà Nội"), Verdict.CORRECT, answeredMs: 1200),
            secondWriter.WriteDraftAsync(seeded.MatchId, seeded.QuestionId, seeded.UserId,
                Answer("Hà Nội"), Verdict.CORRECT, answeredMs: 1300));

        await write;

        using var check = AuthTestDb.OpenDb();
        var row = Assert.Single(await check.Answers.AsNoTracking()
            .Where(a => a.MatchId == seeded.MatchId && a.UserId == seeded.UserId)
            .ToListAsync());
        Assert.Null(row.Verdict);
    }

    [DbFact]
    public async Task A_draft_never_overwrites_a_judged_answer()
    {
        var seeded = await SeedAsync();

        using var judge = AuthTestDb.OpenDb();
        judge.Answers.Add(new AnswerEntity
        {
            MatchId = seeded.MatchId,
            QuestionId = seeded.QuestionId,
            UserId = seeded.UserId,
            Value = Answer("Hà Nội"),
            Verdict = Verdict.CORRECT,
            PointsAwarded = 10,
            SubmittedAt = DateTime.UtcNow
        });
        await judge.SaveChangesAsync();

        using var db = AuthTestDb.OpenDb();
        var writer = new DraftWriter(db);
        var error = await Assert.ThrowsAsync<RuleError>(() =>
            writer.WriteDraftAsync(seeded.MatchId, seeded.QuestionId, seeded.UserId,
                Answer("Sài Gòn"), Verdict.INCORRECT));

        Assert.Equal("ALREADY_JUDGED", error.Code);

        db.ChangeTracker.Clear();
        var row = await db.Answers.AsNoTracking().FirstAsync(a => a.MatchId == seeded.MatchId);
        Assert.Equal(Verdict.CORRECT, row.Verdict);
        Assert.Equal("Hà Nội", Assert.IsType<AnswerValue.Text>(row.ValueObject).Value);
    }

    [DbFact]
    public async Task A_non_revising_draft_write_on_an_unjudged_answer_is_ALREADY_ANSWERED()
    {
        var seeded = await SeedAsync();

        using var db = AuthTestDb.OpenDb();
        var writer = new DraftWriter(db);
        await writer.WriteDraftAsync(seeded.MatchId, seeded.QuestionId, seeded.UserId,
            Answer("Hà Nội"), Verdict.CORRECT, answeredMs: 900);

        var error = await Assert.ThrowsAsync<RuleError>(() =>
            writer.WriteDraftAsync(seeded.MatchId, seeded.QuestionId, seeded.UserId,
                Answer("Sài Gòn"), Verdict.INCORRECT, revise: false));

        Assert.Equal("ALREADY_ANSWERED", error.Code);

        db.ChangeTracker.Clear();
        var row = await db.Answers.AsNoTracking().FirstAsync(a => a.MatchId == seeded.MatchId);
        Assert.Equal("Hà Nội", Assert.IsType<AnswerValue.Text>(row.ValueObject).Value);
    }

    [DbFact]
    public async Task Drafts_from_two_drafters_merge_on_the_same_answer()
    {
        var seeded = await SeedAsync();

        using var db = AuthTestDb.OpenDb();
        var writer = new DraftWriter(db);
        await writer.WriteDraftAsync(seeded.MatchId, seeded.QuestionId, seeded.UserId,
            Answer("Hà Nội"), Verdict.CORRECT);
        await writer.WriteDraftAsync(seeded.MatchId, seeded.QuestionId, seeded.UserId,
            Answer("Hà Nội"), Verdict.INCORRECT, draftedBy: "mcp");

        db.ChangeTracker.Clear();
        var row = await db.Answers.AsNoTracking().FirstAsync(a => a.MatchId == seeded.MatchId);
        var drafts = row.Drafts!.Value.Deserialize<Dictionary<string, Verdict>>(JsonApi.Options)!;
        Assert.Equal(Verdict.CORRECT, drafts[DraftWriter.AutoDrafter]);
        Assert.Equal(Verdict.INCORRECT, drafts["mcp"]);
    }
}
