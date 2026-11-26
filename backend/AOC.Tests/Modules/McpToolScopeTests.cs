using AOC.Api.Modules.Mcp;
using AOC.Domain.Contracts;
using AOC.Infrastructure.Data;
using AOC.Tests.Auth;
using Xunit;

namespace AOC.Tests.Modules;

public class McpToolScopeTests
{
    [Fact]
    public void Every_registered_tool_has_a_scope_in_the_table()
    {
        var missing = McpToolCatalog.Tools
            .Where(tool => !McpToolScope.All.ContainsKey(tool.Name))
            .Select(tool => tool.Name)
            .ToList();

        Assert.Empty(missing);
    }

    [Fact]
    public void Every_scope_is_required_by_a_tool_or_explicitly_reserved()
    {
        var used = McpToolScope.All.Values.ToHashSet();
        var unaccounted = Enum.GetValues<McpScope>()
            .Where(scope => !used.Contains(scope) && !McpToolScope.ReservedScopes.Contains(scope))
            .ToList();

        Assert.Empty(unaccounted);
        Assert.Equal([McpScope.ANNOUNCE], McpToolScope.ReservedScopes);
    }

    [Fact]
    public void The_catalogue_lists_every_tool_of_a_grantable_scope_and_hides_the_reserved_one()
    {
        var scopes = McpToolCatalog.Scopes();
        var registered = McpToolCatalog.Tools.Select(tool => tool.Name).ToHashSet();

        Assert.Equal(["READ", "WRITE"], scopes.Select(scope => scope.Id));
        Assert.All(scopes, scope => Assert.All(scope.Tools, tool => Assert.Contains(tool, registered)));
        Assert.Equal(
            McpToolScope.All.Where(entry => entry.Value == McpScope.WRITE)
                .Select(entry => entry.Key).Order(StringComparer.Ordinal),
            scopes.Single(scope => scope.Id == "WRITE").Tools);
        Assert.True(scopes.Single(scope => scope.Id == "READ").Default);
        Assert.False(scopes.Single(scope => scope.Id == "WRITE").Default);
        Assert.All(scopes, scope => Assert.False(string.IsNullOrWhiteSpace(scope.Title)));

        Assert.DoesNotContain(scopes, scope => scope.Id == McpScope.ANNOUNCE.ToString());
    }

    [Fact]
    public void The_announce_scope_stays_reserved_until_a_tool_enforces_it()
    {
        Assert.Contains(McpScope.ANNOUNCE, McpToolScope.ReservedScopes);
        Assert.Equal(McpScope.ANNOUNCE, McpToolScope.ScopeOf(McpToolNames.Announce));
        Assert.DoesNotContain(McpToolCatalog.Tools, tool => tool.Name == McpToolNames.Announce);
    }

    [DbFact]
    public async Task A_key_without_the_read_scope_is_refused_by_the_gate()
    {
        await AuthTestDb.EnsureSchemaAsync();
        using var harness = McpToolHarness.Open();
        var ownerId = await harness.SeedUserAsync(UserRole.OPERATOR);
        var tournamentId = await harness.SeedTournamentAsync(ownerId, Visibility.PUBLIC);

        var result = await harness.As(ownerId, "WRITE").ListQuestions(tournamentId.ToString());

        Assert.Equal("FORBIDDEN", McpToolHarness.ErrorCode(result));
    }
}
