using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using AOC.Api.Http;
using AOC.Api.Modules.Questions;
using AOC.Api.Modules.Questions.Reads;
using AOC.Domain.Contracts;
using AOC.Infrastructure.Data;
using AOC.Infrastructure.Data.Entities;
using AOC.Tests.Auth;
using Xunit;

namespace AOC.Tests.Questions;

public class RawSqlRegressionTests
{
    private sealed record Fixture(UserEntity User, QuestionBankEntity Question, TournamentEntity Tournament, MatchEntity Match);

    private static async Task<Fixture> SeedAsync(AOCDbContext db)
    {
        var user = new UserEntity
        {
            Id = Guid.NewGuid(),
            Role = UserRole.ADMIN,
            Username = $"q-{Guid.NewGuid():N}"[..20],
            DisplayName = "Question Fixture",
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };
        db.Users.Add(user);
        await db.SaveChangesAsync();

        var tournament = new TournamentEntity
        {
            Id = Guid.NewGuid(),
            Name = "Fixture tournament",
            Slug = $"fixture-{Guid.NewGuid():N}"[..24],
            OwnerId = user.Id,
            Rounds = JsonSerializer.SerializeToElement(new[] { "khoi-dong" }),
            Format = JsonSerializer.SerializeToElement(new { competitorsPerMatch = 4 }),
            Stages = JsonSerializer.SerializeToElement(Array.Empty<object>()),
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };
        db.Tournaments.Add(tournament);
        await db.SaveChangesAsync();

        var question = new QuestionBankEntity
        {
            Id = Guid.NewGuid(),
            Kind = QuestionKind.KEYWORD,
            QuestionText = "fixture keyword question",
            Payload = JsonSerializer.SerializeToElement(new { type = "KEYWORD", code = "FIXTURE" }),
            Status = QuestionStatus.PUBLISHED,
            Tags = ["giai-ma"],
            CreatedBy = user.Id,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };
        db.QuestionBank.Add(question);
        await db.SaveChangesAsync();

        var match = new MatchEntity
        {
            Id = Guid.NewGuid(),
            TournamentId = tournament.Id,
            StageId = "stage-1",
            ScheduledAt = DateTime.UtcNow,
            Label = "Fixture match",
            Players = JsonSerializer.SerializeToElement(Array.Empty<object>()),
            RoundConfigs = JsonSerializer.SerializeToElement(new { }),
            Questions = JsonSerializer.SerializeToElement(new[]
            {
                new { sourceId = question.Id.ToString() }
            }),
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };
        db.Matches.Add(match);
        await db.SaveChangesAsync();

        return new Fixture(user, question, tournament, match);
    }

    private static async Task CleanupAsync(AOCDbContext db, Fixture fixture)
    {
        var match = await db.Matches.FirstOrDefaultAsync(m => m.Id == fixture.Match.Id);
        if (match is not null) db.Matches.Remove(match);

        var question = await db.QuestionBank.FirstOrDefaultAsync(q => q.Id == fixture.Question.Id);
        if (question is not null) db.QuestionBank.Remove(question);

        var tournament = await db.Tournaments.FirstOrDefaultAsync(t => t.Id == fixture.Tournament.Id);
        if (tournament is not null) db.Tournaments.Remove(tournament);

        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == fixture.User.Id);
        if (user is not null) db.Users.Remove(user);

        await db.SaveChangesAsync();
    }

    [DbFact]
    public async Task List_returns_the_seeded_row_with_every_field()
    {
        await AuthTestDb.EnsureSchemaAsync();
        using var db = AuthTestDb.OpenDb();

        var fixture = await SeedAsync(db);
        try
        {
            var service = new QuestionReadStore(db);
            var page = await service.ListAsync(
                new QuestionFilter(Ids: [fixture.Question.Id]), new Page(20, 0));

            Assert.Equal(1, page.Total);
            Assert.Single(page.Items);

            var row = page.Items[0];
            Assert.Equal(fixture.Question.Id, row.Id);
            Assert.Equal(QuestionKind.KEYWORD, row.Kind);
            Assert.Equal(QuestionStatus.PUBLISHED, row.Status);
            Assert.Equal("fixture keyword question", row.QuestionText);
            Assert.Equal(fixture.User.Id, row.CreatedBy);
            Assert.Single(row.Tags);
            Assert.Equal(JsonValueKind.Object, row.Payload.ValueKind);
        }
        finally
        {
            await CleanupAsync(db, fixture);
        }
    }

    [DbFact]
    public async Task List_attaches_the_assigned_match_to_the_question()
    {
        await AuthTestDb.EnsureSchemaAsync();
        using var db = AuthTestDb.OpenDb();

        var fixture = await SeedAsync(db);
        try
        {
            var service = new QuestionReadStore(db);
            var page = await service.ListAsync(
                new QuestionFilter(Ids: [fixture.Question.Id]), new Page(20, 0));

            var row = page.Items[0];
            Assert.NotNull(row.AssignedMatches);
            var usage = Assert.Single(row.AssignedMatches!);
            Assert.Equal(fixture.Match.Id, usage.Id);
            Assert.Equal(fixture.Tournament.Id, usage.TournamentId);
            Assert.Equal("Fixture match", usage.Label);
            Assert.Equal("stage-1", usage.StageId);
        }
        finally
        {
            await CleanupAsync(db, fixture);
        }
    }

    [DbFact]
    public async Task List_leaves_assigned_matches_empty_without_a_match()
    {
        await AuthTestDb.EnsureSchemaAsync();
        using var db = AuthTestDb.OpenDb();

        var fixture = await SeedAsync(db);
        try
        {
            var service = new QuestionReadStore(db);
            var orphan = new QuestionBankEntity
            {
                Id = Guid.NewGuid(),
                Kind = QuestionKind.KEYWORD,
                QuestionText = "orphan keyword question",
                Payload = JsonSerializer.SerializeToElement(new { type = "KEYWORD", code = "ORPHAN" }),
                Status = QuestionStatus.PUBLISHED,
                Tags = ["giai-ma"],
                CreatedBy = fixture.User.Id,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };
            db.QuestionBank.Add(orphan);
            await db.SaveChangesAsync();

            var page = await service.ListAsync(new QuestionFilter(Ids: [orphan.Id]), new Page(20, 0));
            Assert.Single(page.Items);
            Assert.Null(page.Items[0].AssignedMatches);

            db.QuestionBank.Remove(await db.QuestionBank.FirstAsync(q => q.Id == orphan.Id));
            await db.SaveChangesAsync();
        }
        finally
        {
            await CleanupAsync(db, fixture);
        }
    }

    [DbFact]
    public async Task Require_attaches_the_assigned_match()
    {
        await AuthTestDb.EnsureSchemaAsync();
        using var db = AuthTestDb.OpenDb();

        var fixture = await SeedAsync(db);
        try
        {
            var service = new QuestionReadStore(db);
            var row = await service.RequireAsync(fixture.Question.Id.ToString());

            var usage = Assert.Single(row.AssignedMatches!);
            Assert.Equal(fixture.Match.Id, usage.Id);
        }
        finally
        {
            await CleanupAsync(db, fixture);
        }
    }

    [DbFact]
    public async Task List_pages_by_limit_and_offset()
    {
        await AuthTestDb.EnsureSchemaAsync();
        using var db = AuthTestDb.OpenDb();

        var fixture = await SeedAsync(db);
        try
        {
            var service = new QuestionReadStore(db);
            var filter = new QuestionFilter(Ids: [fixture.Question.Id]);

            var first = await service.ListAsync(filter, new Page(1, 0));
            var second = await service.ListAsync(filter, new Page(1, 1));

            Assert.Single(first.Items);
            Assert.Empty(second.Items);
            Assert.Equal(1, first.Total);
            Assert.Equal(1, second.Total);
        }
        finally
        {
            await CleanupAsync(db, fixture);
        }
    }

    [DbFact]
    public async Task List_filters_by_status_kind_search_and_bucket_at_once()
    {
        await AuthTestDb.EnsureSchemaAsync();
        using var db = AuthTestDb.OpenDb();

        var fixture = await SeedAsync(db);
        try
        {
            var service = new QuestionReadStore(db);
            var filter = new QuestionFilter(
                Status: QuestionStatus.PUBLISHED,
                Kind: QuestionKind.KEYWORD,
                Search: "fixture",
                Bucket: "giai-ma");

            var page = await service.ListAsync(filter, new Page(20, 0));
            Assert.Contains(fixture.Question.Id, page.Items.Select(row => row.Id));

            var miss = await service.ListAsync(
                filter with { Search = "no-such-question-token" }, new Page(20, 0));
            Assert.DoesNotContain(fixture.Question.Id, miss.Items.Select(row => row.Id));
        }
        finally
        {
            await CleanupAsync(db, fixture);
        }
    }

    [DbFact]
    public async Task A_search_term_reaches_the_database_as_data_not_as_sql()
    {
        await AuthTestDb.EnsureSchemaAsync();
        using var db = AuthTestDb.OpenDb();

        var fixture = await SeedAsync(db);
        try
        {
            var service = new QuestionReadStore(db);
            var page = await service.ListAsync(
                new QuestionFilter(Search: "x'); DELETE FROM question_bank; --"),
                new Page(20, 0));

            Assert.Empty(page.Items);
            Assert.True(await db.QuestionBank.AsNoTracking()
                .AnyAsync(q => q.Id == fixture.Question.Id));
        }
        finally
        {
            await CleanupAsync(db, fixture);
        }
    }

    [DbFact]
    public async Task BucketCounts_reports_the_seeded_bucket()
    {
        await AuthTestDb.EnsureSchemaAsync();
        using var db = AuthTestDb.OpenDb();

        var fixture = await SeedAsync(db);
        try
        {
            var service = new QuestionReadStore(db);
            var counts = await service.BucketCountsAsync(QuestionStatus.PUBLISHED, null);

            Assert.True(counts.ContainsKey("giai-ma"));
            Assert.True(counts["giai-ma"] >= 1);
        }
        finally
        {
            await CleanupAsync(db, fixture);
        }
    }

    [DbFact]
    public async Task Update_allows_editing_an_assigned_question()
    {
        await AuthTestDb.EnsureSchemaAsync();
        using var db = AuthTestDb.OpenDb();

        var fixture = await SeedAsync(db);
        try
        {
            var crud = new QuestionsService(db);
            var patch = JsonSerializer.SerializeToElement(new
            {
                questionText = "updated fixture question"
            });

            var updated = await crud.UpdateQuestionAsync(fixture.Question.Id.ToString(), patch);

            Assert.Equal("updated fixture question", updated.QuestionText);
            Assert.Equal(fixture.Question.Id, updated.Id);
            var usageStore = new QuestionUsageStore(db);
            var usage = await usageStore.QuestionUsageAsync(fixture.Question.Id.ToString());
            Assert.Contains(usage, u => u.Id == fixture.Match.Id);
        }
        finally
        {
            await CleanupAsync(db, fixture);
        }
    }
}
