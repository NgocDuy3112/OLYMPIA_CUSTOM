using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using AOC.Api.Modules.Questions;
using AOC.Domain.Contracts;
using AOC.Infrastructure.Data;
using AOC.Infrastructure.Data.Entities;
using AOC.Tests.Auth;
using Xunit;

namespace AOC.Tests.Questions;

public class BulkQuestionActionsTests
{
    private static async Task<Guid> SeedUserAsync(AOCDbContext db)
    {
        var user = new UserEntity
        {
            Id = Guid.NewGuid(),
            Role = UserRole.ADMIN,
            Username = $"bulk-{Guid.NewGuid():N}"[..20],
            DisplayName = "Bulk Actor",
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };
        db.Users.Add(user);
        await db.SaveChangesAsync();
        return user.Id;
    }

    private static async Task<QuestionBankEntity> SeedQuestionAsync(
        AOCDbContext db, Guid actorId, QuestionStatus status, params string[] tags)
    {
        var row = new QuestionBankEntity
        {
            Id = Guid.NewGuid(),
            Kind = QuestionKind.TEXT,
            QuestionText = "bulk question " + Guid.NewGuid().ToString("N")[..8],
            Payload = JsonSerializer.SerializeToElement(new { }),
            Status = status,
            Tags = tags.Length == 0 ? ["khoi-dong:rieng"] : tags,
            CreatedBy = actorId,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };
        db.QuestionBank.Add(row);
        await db.SaveChangesAsync();
        return row;
    }

    [DbFact]
    public async Task Status_bulk_moves_every_selected_question_in_one_call()
    {
        await AuthTestDb.EnsureSchemaAsync();
        using var db = AuthTestDb.OpenDb();
        var actorId = await SeedUserAsync(db);
        var first = await SeedQuestionAsync(db, actorId, QuestionStatus.DRAFT);
        var second = await SeedQuestionAsync(db, actorId, QuestionStatus.DRAFT);

        var service = new QuestionsService(db);
        var report = await service.BulkQuestionsAsync(
            new QuestionsService.WriteContext(actorId), "status",
            [first.Id, second.Id], QuestionStatus.PUBLISHED, null, UserRole.ADMIN);

        Assert.Equal(2, report.Total);
        Assert.Equal(2, report.Affected);
        Assert.Empty(report.Errors);

        db.ChangeTracker.Clear();
        var statuses = await db.QuestionBank.AsNoTracking()
            .Where(q => q.Id == first.Id || q.Id == second.Id)
            .Select(q => q.Status)
            .ToListAsync();
        Assert.All(statuses, status => Assert.Equal(QuestionStatus.PUBLISHED, status));
    }

    [DbFact]
    public async Task Status_bulk_keeps_the_questions_it_could_not_move()
    {
        await AuthTestDb.EnsureSchemaAsync();
        using var db = AuthTestDb.OpenDb();
        var actorId = await SeedUserAsync(db);
        var movable = await SeedQuestionAsync(db, actorId, QuestionStatus.DRAFT);
        var archived = await SeedQuestionAsync(db, actorId, QuestionStatus.ARCHIVED);

        var service = new QuestionsService(db);
        var report = await service.BulkQuestionsAsync(
            new QuestionsService.WriteContext(actorId), "status",
            [movable.Id, archived.Id], QuestionStatus.PUBLISHED, null, UserRole.ADMIN);

        Assert.Equal(1, report.Affected);
        Assert.Equal([movable.Id], report.Ids);
        var failure = Assert.Single(report.Errors);
        Assert.Equal(archived.Id, failure.Id);
        Assert.Equal("INVALID_TRANSITION", failure.Code);
    }

    [DbFact]
    public async Task Duplicate_bulk_creates_one_draft_copy_per_question()
    {
        await AuthTestDb.EnsureSchemaAsync();
        using var db = AuthTestDb.OpenDb();
        var actorId = await SeedUserAsync(db);
        var first = await SeedQuestionAsync(db, actorId, QuestionStatus.PUBLISHED);
        var second = await SeedQuestionAsync(db, actorId, QuestionStatus.PUBLISHED);
        var before = await db.QuestionBank.CountAsync(q => q.CreatedBy == actorId);

        var service = new QuestionsService(db);
        var report = await service.BulkQuestionsAsync(
            new QuestionsService.WriteContext(actorId), "duplicate",
            [first.Id, second.Id], null, null, UserRole.ADMIN);

        Assert.Equal(2, report.Affected);
        Assert.Empty(report.Errors);
        Assert.Equal(before + 2, await db.QuestionBank.CountAsync(q => q.CreatedBy == actorId));
    }

    [DbFact]
    public async Task Group_bulk_replaces_only_the_bucket_tag()
    {
        await AuthTestDb.EnsureSchemaAsync();
        using var db = AuthTestDb.OpenDb();
        var actorId = await SeedUserAsync(db);
        var row = await SeedQuestionAsync(db, actorId, QuestionStatus.PUBLISHED, "khoi-dong:rieng", "keep-me");

        var service = new QuestionsService(db);
        var report = await service.BulkQuestionsAsync(
            new QuestionsService.WriteContext(actorId), "group",
            [row.Id], null, "but-pha", UserRole.ADMIN);

        Assert.Equal(1, report.Affected);

        db.ChangeTracker.Clear();
        var stored = await db.QuestionBank.AsNoTracking().FirstAsync(q => q.Id == row.Id);
        Assert.Equal(["keep-me", "but-pha"], stored.Tags);
    }

    [DbFact]
    public async Task Bulk_rejects_an_unknown_action_and_an_unknown_bucket()
    {
        await AuthTestDb.EnsureSchemaAsync();
        using var db = AuthTestDb.OpenDb();
        var actorId = await SeedUserAsync(db);
        var row = await SeedQuestionAsync(db, actorId, QuestionStatus.DRAFT);

        var service = new QuestionsService(db);
        var unknownAction = await CaptureAsync(() => service.BulkQuestionsAsync(
            new QuestionsService.WriteContext(actorId), "publish-everything",
            [row.Id], null, null, UserRole.ADMIN));
        Assert.Equal("VALIDATION", unknownAction.Code.ToString());

        var unknownBucket = await CaptureAsync(() => service.BulkQuestionsAsync(
            new QuestionsService.WriteContext(actorId), "group",
            [row.Id], null, "khong-co-bucket-nay", UserRole.ADMIN));
        Assert.Equal("VALIDATION", unknownBucket.Code.ToString());

        var missingStatus = await CaptureAsync(() => service.BulkQuestionsAsync(
            new QuestionsService.WriteContext(actorId), "status",
            [row.Id], null, null, UserRole.ADMIN));
        Assert.Equal("VALIDATION", missingStatus.Code.ToString());
    }

    [DbFact]
    public async Task Bulk_rejects_duplicate_ids()
    {
        await AuthTestDb.EnsureSchemaAsync();
        using var db = AuthTestDb.OpenDb();
        var actorId = await SeedUserAsync(db);
        var row = await SeedQuestionAsync(db, actorId, QuestionStatus.DRAFT);

        var service = new QuestionsService(db);
        var error = await CaptureAsync(() => service.BulkQuestionsAsync(
            new QuestionsService.WriteContext(actorId), "duplicate",
            [row.Id, row.Id], null, null, UserRole.ADMIN));

        Assert.Equal("VALIDATION", error.Code.ToString());
    }

    private static async Task<QuestionError> CaptureAsync(Func<Task> action)
    {
        try
        {
            await action();
        }
        catch (QuestionError ex)
        {
            return ex;
        }
        throw new InvalidOperationException("expected a QuestionError");
    }
}
