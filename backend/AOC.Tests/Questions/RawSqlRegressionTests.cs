using Microsoft.EntityFrameworkCore;
using AOC.Api.Http;
using AOC.Api.Modules.Matches;
using AOC.Api.Modules.Questions;
using AOC.Tests.Auth;
using Xunit;

namespace AOC.Tests.Questions;

/// <summary>
/// Regression: raw-SQL helpers used to Open the DbContext's shared connection
/// and never close it, so the SECOND raw query of a request threw
/// "Connection already open" (GET /portal/questions, GET /portal/question-imports).
/// RawSql gives every ad-hoc query its own pooled connection instead.
/// </summary>
public class RawSqlRegressionTests
{
    private static bool Ready => AuthTestDb.DatabaseReady();

    [Fact]
    public async Task ListQuestions_RunsBothRawQueriesOnOneContext()
    {
        if (!Ready) return;
        await AuthTestDb.EnsureSchemaAsync();
        using var db = AuthTestDb.OpenDb();

        // Mirror the request shape: the auth guard runs an EF query first…
        _ = await db.Users.AsNoTracking().FirstOrDefaultAsync();

        // …then CountRows + QueryRows are two raw opens back to back.
        var service = new QuestionsService(db);
        var first = await service.ListQuestionsAsync(new QuestionsService.ListFilters(),
            new Page(20, 0));
        var second = await service.ListQuestionsAsync(new QuestionsService.ListFilters(),
            new Page(20, 0));

        Assert.NotNull(first);
        Assert.NotNull(second);
        Assert.Equal(0, first.Total);
    }

    [Fact]
    public async Task Staging_RunsActiveBatchThenListBatches()
    {
        if (!Ready) return;
        await AuthTestDb.EnsureSchemaAsync();
        using var db = AuthTestDb.OpenDb();

        var questions = new QuestionsService(db);
        var staging = new StagingService(db, questions, new AssemblePatchService(db));

        // The route calls ActiveBatch (raw) and then ListBatches (raw again).
        // (Whether a batch exists depends on the database — the point is that
        // BOTH raw queries run on one context without "Connection already open".)
        var active = await staging.ActiveBatchAsync();
        var batches = await staging.ListBatchesAsync();

        Assert.NotNull(batches);
        if (active is not null)
            Assert.Equal(active.Id, batches.First(b => b.Id == active.Id).Id);
    }

    [Fact]
    public async Task BucketCountsAndUsage_OpenTheirownConnections()
    {
        if (!Ready) return;
        await AuthTestDb.EnsureSchemaAsync();
        using var db = AuthTestDb.OpenDb();

        var service = new QuestionsService(db);
        var counts = await service.BucketCountsAsync(null, null);
        var usage = await service.QuestionUsageAsync(Guid.NewGuid().ToString());

        Assert.NotNull(counts);
        Assert.NotNull(usage);
    }
}
