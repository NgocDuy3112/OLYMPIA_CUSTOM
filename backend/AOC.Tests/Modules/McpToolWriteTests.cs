using System.Text.Json;
using AOC.Domain.Contracts;
using AOC.Infrastructure.Data;
using AOC.Infrastructure.Data.Entities;
using AOC.Tests.Auth;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace AOC.Tests.Modules;

public class McpToolWriteTests
{
    private static JsonElement Json(string raw) => JsonDocument.Parse(raw).RootElement.Clone();

    private static JsonElement Payload(string text) => Json("""{"type":"TEXT","acceptedAnswers":["x"]}""");

    [Fact]
    public void Every_tool_in_the_table_is_registered_or_its_scope_is_reserved()
    {
        var unaccounted = AOC.Api.Modules.Mcp.McpToolScope.All
            .Where(entry => AOC.Api.Modules.Mcp.McpToolCatalog.Tools.All(tool => tool.Name != entry.Key))
            .Where(entry => !AOC.Api.Modules.Mcp.McpToolScope.ReservedScopes.Contains(entry.Value))
            .Select(entry => entry.Key)
            .ToList();

        Assert.Empty(unaccounted);
    }

    [Fact]
    public void Every_registered_tool_declares_its_arguments()
    {
        var tools = AOC.Api.Modules.Mcp.McpToolCatalog.BuildTools(
            _ => throw new InvalidOperationException("the factory is not invoked by building the catalogue"));

        Assert.Equal(AOC.Api.Modules.Mcp.McpToolCatalog.Tools.Count, tools.Count);
        Assert.All(tools, tool => Assert.True(tool.ProtocolTool.InputSchema.ValueKind == JsonValueKind.Object));
        var write = tools.Single(tool => tool.ProtocolTool.Name == "live_action");
        Assert.Contains("expectedVersion", write.ProtocolTool.InputSchema.GetProperty("required")
            .EnumerateArray().Select(item => item.GetString()));
    }

    [DbFact]
    public async Task Create_question_inserts_a_draft_and_dry_run_inserts_nothing()
    {
        await AuthTestDb.EnsureSchemaAsync();
        using var harness = McpToolHarness.Open();
        var ownerId = await harness.SeedUserAsync(UserRole.OPERATOR);
        var tournamentId = await harness.SeedTournamentAsync(ownerId, Visibility.PRIVATE);
        var tools = harness.As(ownerId, "WRITE");

        var questionText = "MCP draft " + Guid.NewGuid().ToString("N")[..10];
        var preview = await tools.CreateQuestion(tournamentId.ToString(), "TEXT", questionText,
            Payload("text"), dryRun: true);
        Assert.True(preview.IsError is not true);
        Assert.True(McpToolHarness.Payload(preview).GetProperty("dryRun").GetBoolean());
        Assert.Equal(0, await harness.Db.QuestionBank.CountAsync(q => q.QuestionText == questionText));

        var created = await tools.CreateQuestion(tournamentId.ToString(), "TEXT", questionText,
            Payload("text"));
        Assert.True(created.IsError is not true);
        Assert.Equal("DRAFT", McpToolHarness.Payload(created).GetProperty("question").GetProperty("status").GetString());
        Assert.Equal(1, await harness.Db.QuestionBank.CountAsync(q => q.QuestionText == questionText));
    }

    [DbFact]
    public async Task Create_question_refuses_a_tournament_the_key_cannot_write()
    {
        await AuthTestDb.EnsureSchemaAsync();
        using var harness = McpToolHarness.Open();
        var ownerId = await harness.SeedUserAsync(UserRole.OPERATOR);
        var strangerId = await harness.SeedUserAsync(UserRole.OPERATOR);
        var tournamentId = await harness.SeedTournamentAsync(ownerId, Visibility.PRIVATE);
        var keyId = Guid.NewGuid();

        var result = await harness.As(strangerId, keyId, "WRITE")
            .CreateQuestion(tournamentId.ToString(), "TEXT", "Nope", Payload("text"));

        Assert.Equal("NOT_FOUND", McpToolHarness.ErrorCode(result));
        var trail = await harness.Db.AuditEvents.AsNoTracking()
            .Where(e => e.Action.StartsWith("mcp_tool_"))
            .ToListAsync();
        Assert.Contains(trail, row => row.Action == "mcp_tool_failed"
                                      && row.Details!.Value.GetProperty("mcpKeyId").GetGuid() == keyId);
    }

    [DbFact]
    public async Task Update_question_needs_the_version_it_read_and_dry_run_writes_nothing()
    {
        await AuthTestDb.EnsureSchemaAsync();
        using var harness = McpToolHarness.Open();
        var ownerId = await harness.SeedUserAsync(UserRole.OPERATOR);
        var tournamentId = await harness.SeedTournamentAsync(ownerId, Visibility.PRIVATE);
        var questionId = await harness.SeedQuestionAsync(ownerId);
        var tools = harness.As(ownerId, "READ", "WRITE");

        var read = await tools.GetQuestion(questionId.ToString(), tournamentId.ToString());
        var version = McpToolHarness.Payload(read).GetProperty("version").GetInt32();
        var patch = Json("""{"questionText":"Rewritten by an agent"}""");

        var stale = await tools.UpdateQuestion(tournamentId.ToString(), questionId.ToString(),
            version - 1, patch);
        var conflict = McpToolHarness.Payload(stale);
        Assert.Equal("CONFLICT", conflict.GetProperty("error").GetString());
        Assert.Equal(version, conflict.GetProperty("currentVersion").GetInt32());

        var preview = await tools.UpdateQuestion(tournamentId.ToString(), questionId.ToString(),
            version, patch, dryRun: true);
        Assert.True(McpToolHarness.Payload(preview).GetProperty("dryRun").GetBoolean());
        harness.Db.ChangeTracker.Clear();
        Assert.NotEqual("Rewritten by an agent", (await harness.Db.QuestionBank.AsNoTracking()
            .FirstAsync(q => q.Id == questionId)).QuestionText);

        var applied = await tools.UpdateQuestion(tournamentId.ToString(), questionId.ToString(),
            version, patch);
        Assert.True(applied.IsError is not true);
        harness.Db.ChangeTracker.Clear();
        Assert.Equal("Rewritten by an agent", (await harness.Db.QuestionBank.AsNoTracking()
            .FirstAsync(q => q.Id == questionId)).QuestionText);
    }

    [DbFact]
    public async Task Assemble_match_rejects_a_stale_revision_and_reports_the_current_one()
    {
        await AuthTestDb.EnsureSchemaAsync();
        using var harness = McpToolHarness.Open();
        var ownerId = await harness.SeedUserAsync(UserRole.OPERATOR);
        var tournamentId = await harness.SeedTournamentAsync(ownerId, Visibility.PRIVATE, "but-pha");
        var matchId = await harness.SeedMatchAsync(tournamentId);
        var sourceId = await harness.SeedBucketQuestionAsync(ownerId, "but-pha");
        var keyId = Guid.NewGuid();
        var tools = harness.As(ownerId, keyId, "WRITE");

        var entries = Json(JsonSerializer.Serialize(new[]
        {
            new { sourceId, roundId = "but-pha", turnId = McpToolHarness.ButPhaTurnId(), points = (int?)null }
        }));

        var preview = await tools.AssembleMatch(tournamentId.ToString(), matchId.ToString(), 0, entries,
            dryRun: true);
        Assert.Equal(1, McpToolHarness.Payload(preview).GetProperty("assemblyRevision").GetInt32());
        harness.Db.ChangeTracker.Clear();
        Assert.Equal(0, (await harness.Db.Matches.AsNoTracking().FirstAsync(m => m.Id == matchId)).AssemblyRevision);

        var applied = await tools.AssembleMatch(tournamentId.ToString(), matchId.ToString(), 0, entries);
        Assert.Equal(1, McpToolHarness.Payload(applied).GetProperty("assemblyRevision").GetInt32());

        var stale = await tools.AssembleMatch(tournamentId.ToString(), matchId.ToString(), 0, entries);
        var conflict = McpToolHarness.Payload(stale);
        Assert.Equal("CONFLICT", conflict.GetProperty("error").GetString());
        Assert.Equal(1, conflict.GetProperty("currentVersion").GetInt32());
    }

    [DbFact]
    public async Task Transition_match_maps_a_stale_status_to_conflict()
    {
        await AuthTestDb.EnsureSchemaAsync();
        using var harness = McpToolHarness.Open();
        var ownerId = await harness.SeedUserAsync(UserRole.OPERATOR);
        var tournamentId = await harness.SeedTournamentAsync(ownerId, Visibility.PRIVATE, "but-pha");
        var matchId = await harness.SeedMatchAsync(tournamentId);
        var tools = harness.As(ownerId, "WRITE");

        var stale = await tools.TransitionMatch(tournamentId.ToString(), matchId.ToString(), 1, "LIVE");
        var conflict = McpToolHarness.Payload(stale);
        Assert.Equal("CONFLICT", conflict.GetProperty("error").GetString());
        Assert.Equal(0, conflict.GetProperty("currentVersion").GetInt32());

        var preview = await tools.TransitionMatch(tournamentId.ToString(), matchId.ToString(), 0, "LIVE",
            dryRun: true);
        Assert.Equal("LIVE", McpToolHarness.Payload(preview).GetProperty("to").GetString());
        harness.Db.ChangeTracker.Clear();
        Assert.Equal(MatchStatus.UPCOMING,
            (await harness.Db.Matches.AsNoTracking().FirstAsync(m => m.Id == matchId)).Status);

        var impossible = await tools.TransitionMatch(tournamentId.ToString(), matchId.ToString(), 0, "FINISHED");
        Assert.Equal("INVALID_TRANSITION", McpToolHarness.ErrorCode(impossible));
    }

    [DbFact]
    public async Task Live_action_maps_a_stale_version_to_conflict_and_previews_the_next_one()
    {
        await AuthTestDb.EnsureSchemaAsync();
        using var harness = McpToolHarness.Open();
        var ownerId = await harness.SeedUserAsync(UserRole.OPERATOR);
        var tournamentId = await harness.SeedTournamentAsync(ownerId, Visibility.PRIVATE, "but-pha");
        var matchId = await harness.SeedMatchAsync(tournamentId, MatchStatus.LIVE);
        await harness.SeedLiveAsync(matchId, version: 3);
        var tools = harness.As(ownerId, "WRITE");

        var stale = await tools.LiveAction(tournamentId.ToString(), matchId.ToString(), 2,
            Json("""{"kind":"round.waiting"}"""));
        var conflict = McpToolHarness.Payload(stale);
        Assert.Equal("CONFLICT", conflict.GetProperty("error").GetString());
        Assert.Equal(3, conflict.GetProperty("currentVersion").GetInt32());

        var preview = await tools.LiveAction(tournamentId.ToString(), matchId.ToString(), 3,
            Json("""{"kind":"round.waiting"}"""), dryRun: true);
        var previewBody = McpToolHarness.Payload(preview);
        Assert.Equal(3, previewBody.GetProperty("fromVersion").GetInt32());
        Assert.Equal(4, previewBody.GetProperty("toVersion").GetInt32());

        var applied = await tools.LiveAction(tournamentId.ToString(), matchId.ToString(), 3,
            Json("""{"kind":"round.waiting"}"""));
        Assert.True(applied.IsError is not true);
        Assert.Equal(4, McpToolHarness.Payload(applied).GetProperty("version").GetInt32());
    }

    [DbFact]
    public async Task A_write_tool_without_the_write_scope_leaves_a_denied_row()
    {
        await AuthTestDb.EnsureSchemaAsync();
        using var harness = McpToolHarness.Open();
        var ownerId = await harness.SeedUserAsync(UserRole.OPERATOR);
        var tournamentId = await harness.SeedTournamentAsync(ownerId, Visibility.PRIVATE);
        var keyId = Guid.NewGuid();

        var result = await harness.As(ownerId, keyId, "READ").CreateQuestion(tournamentId.ToString(),
            "TEXT", "Nope", Payload("text"));

        Assert.Equal("FORBIDDEN", McpToolHarness.ErrorCode(result));
        var trail = await harness.Db.AuditEvents.AsNoTracking()
            .Where(e => e.Action == "mcp_tool_denied")
            .ToListAsync();
        Assert.Contains(trail, row => row.Details!.Value.GetProperty("mcpKeyId").GetGuid() == keyId);
    }
}
