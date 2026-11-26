using System.Text.Json;
using AOC.Api.Modules.Live;
using AOC.Api.Modules.Mcp;
using AOC.Api.Modules.McpKeys;
using AOC.Api.Modules.Questions;
using AOC.Infrastructure.Data;
using AOC.Tests.Auth;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace AOC.Tests.Modules;

public class McpCatalogueTests
{
    [Fact]
    public void The_catalogue_lists_every_live_action_kind_with_its_fields()
    {
        var kinds = McpCatalogue.Snapshot().GetProperty("liveActionKinds").EnumerateArray().ToList();
        var recordTypes = typeof(LiveAction).GetNestedTypes()
            .Where(type => type.IsSubclassOf(typeof(LiveAction)))
            .ToList();

        Assert.Equal(recordTypes.Count, kinds.Count);
        Assert.Equal(recordTypes.Count,
            kinds.Select(kind => kind.GetProperty("kind").GetString()).Distinct().Count());
        Assert.All(kinds, kind => Assert.True(kind.GetProperty("fields").ValueKind is JsonValueKind.Array));
        var reveal = kinds.Single(kind => kind.GetProperty("kind").GetString() == "reveal.answer");
        Assert.Equal("questionId", reveal.GetProperty("fields").EnumerateArray().Single()
            .GetProperty("name").GetString());
    }

    [Fact]
    public void The_catalogue_lists_every_bucket_with_its_slot()
    {
        var buckets = McpCatalogue.Snapshot().GetProperty("buckets").EnumerateArray().ToList();

        Assert.Equal(Buckets.AllBuckets.Count, buckets.Count);
        var butPha = buckets.Single(bucket => bucket.GetProperty("bucket").GetString() == "but-pha");
        Assert.Equal("TEXT", butPha.GetProperty("kind").GetString());
        Assert.Equal("but-pha", butPha.GetProperty("slot").GetProperty("roundId").GetString());
        var tieBreak = buckets.Single(bucket => bucket.GetProperty("bucket").GetString() == Buckets.TieBreakBucket);
        Assert.Equal(JsonValueKind.Null, tieBreak.GetProperty("slot").ValueKind);
    }

    [Fact]
    public void The_catalogue_carries_the_tools_scopes_and_conventions()
    {
        var snapshot = McpCatalogue.Snapshot();

        Assert.Equal(McpToolCatalog.Tools.Count, snapshot.GetProperty("tools").GetArrayLength());
        Assert.Equal(Enum.GetValues<McpScope>().Length - McpToolScope.ReservedScopes.Count,
            snapshot.GetProperty("scopes").GetArrayLength());
        Assert.Contains("CONFLICT", snapshot.GetProperty("conventions").GetProperty("conflict").GetString());
    }

    [DbFact]
    public async Task The_scopes_response_matches_the_shape_the_portal_renders()
    {
        await AuthTestDb.EnsureSchemaAsync();
        var json = JsonSerializer.Serialize(new McpScopesResponse(McpToolCatalog.Scopes()),
            AOC.Api.Http.JsonApi.Options);
        var root = JsonDocument.Parse(json).RootElement;

        Assert.Equal(["scopes"], root.EnumerateObject().Select(property => property.Name));
        var read = root.GetProperty("scopes")[0];
        Assert.Equal(["id", "title", "tools", "default"],
            read.EnumerateObject().Select(property => property.Name));
        Assert.Equal("READ", read.GetProperty("id").GetString());
        Assert.True(read.GetProperty("default").GetBoolean());
        Assert.Contains("list_questions",
            read.GetProperty("tools").EnumerateArray().Select(tool => tool.GetString()));
    }

    [DbFact]
    public async Task A_key_write_coalesces_the_last_used_stamp()
    {
        await AuthTestDb.EnsureSchemaAsync();
        using var db = AuthTestDb.OpenDb();
        var now = DateTime.UtcNow;
        var userId = Guid.NewGuid();
        db.Users.Add(new AOC.Infrastructure.Data.Entities.UserEntity
        {
            Id = userId,
            Role = UserRole.OPERATOR,
            Username = "mcp-usage-" + Guid.NewGuid().ToString("N")[..8],
            DisplayName = "Usage",
            CreatedAt = now,
            UpdatedAt = now
        });
        await db.SaveChangesAsync();

        var service = new McpKeysService(db);
        var issued = await service.CreateMcpKeyAsync(userId, "usage", ["READ"], null);

        await service.VerifyMcpTokenAsync(issued.Token, "10.0.0.1");
        var first = await StampAsync(db, issued.Key.Id);
        Assert.True(first.LastUsedAt <= DateTime.UtcNow);

        db.ChangeTracker.Clear();
        var stale = now - TimeSpan.FromSeconds(10);
        await db.McpKeys.Where(k => k.Id == issued.Key.Id)
            .ExecuteUpdateAsync(setters => setters.SetProperty(k => k.LastUsedAt, stale));
        db.ChangeTracker.Clear();

        await service.VerifyMcpTokenAsync(issued.Token, "10.0.0.2");
        var second = await StampAsync(db, issued.Key.Id);
        Assert.Equal(stale, second.LastUsedAt);
        Assert.Null(second.LastIp);

        db.ChangeTracker.Clear();
        var old = now - TimeSpan.FromMinutes(5);
        await db.McpKeys.Where(k => k.Id == issued.Key.Id)
            .ExecuteUpdateAsync(setters => setters.SetProperty(k => k.LastUsedAt, old));
        db.ChangeTracker.Clear();

        await service.VerifyMcpTokenAsync(issued.Token, "10.0.0.2");
        var third = await StampAsync(db, issued.Key.Id);
        Assert.True(third.LastUsedAt > old);
        Assert.Equal("10.0.0.2", third.LastIp);
    }

    private static async Task<(DateTime LastUsedAt, string? LastIp)> StampAsync(AOCDbContext db, Guid keyId)
    {
        db.ChangeTracker.Clear();
        var row = await db.McpKeys.AsNoTracking().FirstAsync(k => k.Id == keyId);
        return (row.LastUsedAt, row.LastIp);
    }
}
