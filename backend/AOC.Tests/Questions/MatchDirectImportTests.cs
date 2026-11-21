using System.Text.Json;
using ClosedXML.Excel;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using AOC.Api.Http;
using AOC.Api.Modules.Matches;
using AOC.Api.Modules.Questions;
using AOC.Domain.Contracts;
using AOC.Domain.Gameplay;
using AOC.Infrastructure.Data;
using AOC.Infrastructure.Data.Entities;
using AOC.Tests.Auth;

namespace AOC.Tests.Questions;

public class MatchDirectImportTests
{
    private static byte[] Workbook(params (string Sheet, List<string[]> Rows)[] sheets)
    {
        using var wb = new XLWorkbook();
        foreach (var (name, rows) in sheets)
        {
            var ws = wb.Worksheets.Add(name);
            var line = 1;
            foreach (var cells in rows)
            {
                var column = 1;
                foreach (var cell in cells)
                {
                    ws.Cell(line, column).Value = cell;
                    column += 1;
                }
                line += 1;
            }
        }
        using var ms = new MemoryStream();
        wb.SaveAs(ms);
        return ms.ToArray();
    }

    private static List<string[]> Sheet(params string[][] rows)
        => rows.ToList();

    private static string[] Header()
        => ["id", "cau hoi", "dap an", "giai thich", "ghi chu", "media"];

    private sealed record Fixture(UserEntity User, TournamentEntity Tournament, MatchEntity Match, string Tag);

    private static async Task<Fixture> SeedAsync(AOCDbContext db)
    {
        var tag = Guid.NewGuid().ToString("N")[..8];
        var user = new UserEntity
        {
            Id = Guid.NewGuid(),
            Role = UserRole.ADMIN,
            Username = $"direct-{tag}",
            DisplayName = "Direct Import Fixture",
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };
        db.Users.Add(user);
        await db.SaveChangesAsync();

        var tournament = new TournamentEntity
        {
            Id = Guid.NewGuid(),
            Name = $"Fixture tournament {tag}",
            Slug = $"fixture-{tag}",
            OwnerId = user.Id,
            Rounds = JsonSerializer.SerializeToElement(AocRulebook.AocRounds, JsonDefaults.Options),
            Format = JsonSerializer.SerializeToElement(new { competitorsPerMatch = 4 }),
            Stages = JsonSerializer.SerializeToElement(Array.Empty<object>()),
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };
        db.Tournaments.Add(tournament);
        await db.SaveChangesAsync();

        var match = new MatchEntity
        {
            Id = Guid.NewGuid(),
            TournamentId = tournament.Id,
            StageId = "stage-1",
            ScheduledAt = DateTime.UtcNow,
            Label = "Fixture match",
            Players = JsonSerializer.SerializeToElement(Array.Empty<object>()),
            RoundConfigs = JsonSerializer.SerializeToElement(new Dictionary<string, RoundConfig>()),
            Questions = JsonSerializer.SerializeToElement(Array.Empty<object>()),
            AssemblyRevision = 0,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };
        db.Matches.Add(match);
        await db.SaveChangesAsync();

        return new Fixture(user, tournament, match, tag);
    }

    private static async Task CleanupAsync(AOCDbContext db, Fixture fixture)
    {
        var events = await db.MatchAssemblyEvents
            .Where(e => e.MatchId == fixture.Match.Id)
            .ToListAsync();
        db.MatchAssemblyEvents.RemoveRange(events);

        var orphans = await db.QuestionBank
            .Where(q => q.QuestionText.Contains(fixture.Tag))
            .ToListAsync();
        var children = orphans.Where(q => q.KeywordId is not null).ToList();
        var parents = orphans.Where(q => q.KeywordId is null).ToList();
        db.QuestionBank.RemoveRange(children);
        db.QuestionBank.RemoveRange(parents);

        var match = await db.Matches.FirstOrDefaultAsync(m => m.Id == fixture.Match.Id);
        if (match is not null) db.Matches.Remove(match);

        var tournament = await db.Tournaments.FirstOrDefaultAsync(t => t.Id == fixture.Tournament.Id);
        if (tournament is not null) db.Tournaments.Remove(tournament);

        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == fixture.User.Id);
        if (user is not null) db.Users.Remove(user);

        await db.SaveChangesAsync();
    }

    private static MatchDirectImportService Service(AOCDbContext db)
        => new(db, new QuestionsService(db), new AssemblePatchService(db),
            NullLogger<MatchDirectImportService>.Instance);

    [DbFact]
    public async Task Valid_multisheet_bundle_attaches_everything_and_keeps_draft()
    {
        await AuthTestDb.EnsureSchemaAsync();
        using var db = AuthTestDb.OpenDb();

        var fixture = await SeedAsync(db);
        try
        {
            var buffer = Workbook(
                ("KHOI_DONG", Sheet(
                    Header(),
                    ["KD_1_1", $"khoi dong rieng {fixture.Tag}", "dap an A", "", "", ""],
                    ["KD_C_1", $"khoi dong chung {fixture.Tag}", "dap an B", "", "", ""])),
                ("BUT_PHA", Sheet(
                    Header(),
                    ["BP_1", $"but pha {fixture.Tag}", "dap an C", "", "", ""])));

            var result = await Service(db).ImportToMatchAsync(
                new QuestionsService.WriteContext(fixture.User.Id),
                fixture.Tournament.Id.ToString(), fixture.Match.Id.ToString(), buffer, []);

            Assert.Equal(3, result.Created);
            Assert.Equal(1, result.AssemblyRevision);

            var wire = JsonSerializer.SerializeToElement(result, JsonApi.Options);
            Assert.True(wire.TryGetProperty("created", out var created));
            Assert.True(wire.TryGetProperty("assemblyRevision", out var revision));
            Assert.Equal(3, created.GetInt32());
            Assert.Equal(1, revision.GetInt32());

            var match = await db.Matches.AsNoTracking().FirstAsync(m => m.Id == fixture.Match.Id);
            Assert.Equal(1, match.AssemblyRevision);
            Assert.Equal(3, match.QuestionsList.Count);
            var sourceIds = match.QuestionsList.Select(q => Guid.Parse(q.SourceId)).ToList();

            var rows = await db.QuestionBank.AsNoTracking()
                .Where(q => sourceIds.Contains(q.Id))
                .ToListAsync();
            Assert.Equal(3, rows.Count);
            Assert.All(rows, row => Assert.Equal(QuestionStatus.DRAFT, row.Status));
        }
        finally
        {
            await CleanupAsync(db, fixture);
        }
    }

    [DbFact]
    public async Task One_bad_row_rejects_the_whole_file_with_nothing_written()
    {
        await AuthTestDb.EnsureSchemaAsync();
        using var db = AuthTestDb.OpenDb();

        var fixture = await SeedAsync(db);
        try
        {
            var buffer = Workbook(
                ("KHOI_DONG", Sheet(
                    Header(),
                    ["KD_1_1", $"khoi dong rieng {fixture.Tag}", "dap an A", "", "", ""],
                    ["KD_NOPE", $"dong loi {fixture.Tag}", "dap an B", "", "", ""])));

            var error = await Assert.ThrowsAsync<QuestionRowError>(() =>
                Service(db).ImportToMatchAsync(
                    new QuestionsService.WriteContext(fixture.User.Id),
                    fixture.Tournament.Id.ToString(), fixture.Match.Id.ToString(), buffer, []));

            Assert.Equal(QuestionErrorCode.VALIDATION, error.Code);
            Assert.Contains(error.Rows, row => row.Message.Contains("KD_NOPE"));

            var stored = await db.QuestionBank.AsNoTracking()
                .Where(q => q.QuestionText.Contains(fixture.Tag))
                .ToListAsync();
            Assert.Empty(stored);

            var match = await db.Matches.AsNoTracking().FirstAsync(m => m.Id == fixture.Match.Id);
            Assert.Equal(0, match.AssemblyRevision);
            Assert.Empty(match.QuestionsList);
        }
        finally
        {
            await CleanupAsync(db, fixture);
        }
    }

    [DbFact]
    public async Task Keyword_pair_attach_failure_rolls_back_children_first_with_original_error()
    {
        await AuthTestDb.EnsureSchemaAsync();
        using var db = AuthTestDb.OpenDb();

        var fixture = await SeedAsync(db);
        try
        {
            var buffer = Workbook(
                ("GIAI_MA", Sheet(
                    Header(),
                    ["GM_KEY", $"tu khoa {fixture.Tag}", "MATKHAU", "", "", ""],
                    ["GM_1", $"goi y mot {fixture.Tag}", "goi y A", "", "", ""],
                    ["GM_2", $"goi y hai {fixture.Tag}", "goi y B", "", "", ""])));

            var tracked = await db.Matches.FirstAsync(m => m.Id == fixture.Match.Id);
            tracked.Status = MatchStatus.LIVE;
            await db.SaveChangesAsync();

            var error = await Assert.ThrowsAsync<QuestionError>(() =>
                Service(db).ImportToMatchAsync(
                    new QuestionsService.WriteContext(fixture.User.Id),
                    fixture.Tournament.Id.ToString(), fixture.Match.Id.ToString(), buffer, []));

            Assert.Equal(QuestionErrorCode.IMMUTABLE, error.Code);
            Assert.Contains("can no longer be assembled", error.Message);

            var stored = await db.QuestionBank.AsNoTracking()
                .Where(q => q.QuestionText.Contains(fixture.Tag))
                .ToListAsync();
            Assert.Empty(stored);

            var match = await db.Matches.AsNoTracking().FirstAsync(m => m.Id == fixture.Match.Id);
            Assert.Equal(0, match.AssemblyRevision);
            Assert.Empty(match.QuestionsList);
        }
        finally
        {
            await CleanupAsync(db, fixture);
        }
    }
}
