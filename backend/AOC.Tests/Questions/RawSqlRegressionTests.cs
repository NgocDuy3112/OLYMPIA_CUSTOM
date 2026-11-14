using Microsoft.EntityFrameworkCore;
using AOC.Api.Http;
using AOC.Api.Modules.Matches;
using AOC.Api.Modules.Questions;
using AOC.Tests.Auth;
using Xunit;

namespace AOC.Tests.Questions;

public class RawSqlRegressionTests
{
    private static bool Ready => AuthTestDb.DatabaseReady();

    [Fact]
    public async Task ListQuestions_RunsBothRawQueriesOnOneContext()
    {
        if (!Ready) return;
        await AuthTestDb.EnsureSchemaAsync();
        using var db = AuthTestDb.OpenDb();

        _ = await db.Users.AsNoTracking().FirstOrDefaultAsync();

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
