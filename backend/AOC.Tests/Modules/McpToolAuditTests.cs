using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using AOC.Domain.Contracts;
using AOC.Infrastructure.Data;
using AOC.Tests.Auth;
using Xunit;

namespace AOC.Tests.Modules;

public class McpToolAuditTests
{
    private static async Task<List<(string Action, JsonElement Details)>> TrailAsync(
        McpToolHarness harness, Guid keyId)
    {
        harness.Db.ChangeTracker.Clear();
        var rows = await harness.Db.AuditEvents.AsNoTracking()
            .Where(e => e.Action.StartsWith("mcp_tool_"))
            .OrderBy(e => e.CreatedAt)
            .ToListAsync();
        return rows
            .Where(row => row.Details is { } details
                          && details.TryGetProperty("mcpKeyId", out var key)
                          && key.GetGuid() == keyId)
            .Select(row => (row.Action, row.Details!.Value))
            .ToList();
    }

    [DbFact]
    public async Task An_allowed_call_records_the_call_with_its_outcome()
    {
        await AuthTestDb.EnsureSchemaAsync();
        using var harness = McpToolHarness.Open();
        var ownerId = await harness.SeedUserAsync(UserRole.OPERATOR);
        var tournamentId = await harness.SeedTournamentAsync(ownerId, Visibility.PRIVATE);
        var questionId = await harness.SeedQuestionAsync(ownerId);
        var keyId = Guid.NewGuid();

        var result = await harness.As(ownerId, keyId, "READ")
            .GetQuestion(questionId.ToString(), tournamentId.ToString());

        Assert.True(result.IsError is not true);
        var row = Assert.Single(await TrailAsync(harness, keyId));
        Assert.Equal("mcp_tool_call", row.Action);
        Assert.Equal("allowed", row.Details.GetProperty("outcome").GetString());
        Assert.Equal("get_question", row.Details.GetProperty("tool").GetString());
        Assert.Null(row.Details.GetProperty("error").GetString());
    }

    [DbFact]
    public async Task A_denied_scope_leaves_a_denied_row()
    {
        await AuthTestDb.EnsureSchemaAsync();
        using var harness = McpToolHarness.Open();
        var ownerId = await harness.SeedUserAsync(UserRole.OPERATOR);
        var tournamentId = await harness.SeedTournamentAsync(ownerId, Visibility.PRIVATE);
        var keyId = Guid.NewGuid();

        var result = await harness.As(ownerId, keyId, "WRITE")
            .ListQuestions(tournamentId.ToString());

        Assert.Equal("FORBIDDEN", McpToolHarness.ErrorCode(result));
        var row = Assert.Single(await TrailAsync(harness, keyId));
        Assert.Equal("mcp_tool_denied", row.Action);
        Assert.Equal("denied", row.Details.GetProperty("outcome").GetString());
        Assert.Equal("FORBIDDEN", row.Details.GetProperty("error").GetString());
    }

    [DbFact]
    public async Task A_refused_ownership_check_leaves_a_failed_row()
    {
        await AuthTestDb.EnsureSchemaAsync();
        using var harness = McpToolHarness.Open();
        var ownerId = await harness.SeedUserAsync(UserRole.OPERATOR);
        var strangerId = await harness.SeedUserAsync(UserRole.OPERATOR);
        var tournamentId = await harness.SeedTournamentAsync(ownerId, Visibility.PRIVATE);
        var questionId = await harness.SeedQuestionAsync(ownerId);
        var keyId = Guid.NewGuid();

        var result = await harness.As(strangerId, keyId, "READ")
            .GetQuestion(questionId.ToString(), tournamentId.ToString());

        Assert.Equal("NOT_FOUND", McpToolHarness.ErrorCode(result));
        var row = Assert.Single(await TrailAsync(harness, keyId));
        Assert.Equal("mcp_tool_failed", row.Action);
        Assert.Equal("failed", row.Details.GetProperty("outcome").GetString());
        Assert.Equal("NOT_FOUND", row.Details.GetProperty("error").GetString());
        Assert.Equal(tournamentId, row.Details.GetProperty("tournamentId").GetGuid());
    }
}
