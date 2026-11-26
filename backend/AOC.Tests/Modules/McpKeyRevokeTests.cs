using Microsoft.EntityFrameworkCore;
using AOC.Api.Modules.McpKeys;
using AOC.Infrastructure.Data;
using AOC.Infrastructure.Data.Entities;
using AOC.Tests.Auth;
using Xunit;

namespace AOC.Tests.Modules;

public class McpKeyRevokeTests
{
    private sealed record Seeded(Guid OwnerId, Guid StrangerId, Guid FirstKeyId, Guid SecondKeyId, Guid StrangerKeyId);

    private static async Task<Seeded> SeedAsync(AOCDbContext db)
    {
        var now = DateTime.UtcNow;
        var ownerId = Guid.NewGuid();
        var strangerId = Guid.NewGuid();

        db.Users.Add(new UserEntity
        {
            Id = ownerId,
            Role = UserRole.OPERATOR,
            Username = "revoke-owner-" + Guid.NewGuid().ToString("N")[..8],
            DisplayName = "Owner",
            CreatedAt = now,
            UpdatedAt = now
        });
        db.Users.Add(new UserEntity
        {
            Id = strangerId,
            Role = UserRole.OPERATOR,
            Username = "revoke-stranger-" + Guid.NewGuid().ToString("N")[..8],
            DisplayName = "Stranger",
            CreatedAt = now,
            UpdatedAt = now
        });
        await db.SaveChangesAsync();

        Guid AddKey(Guid userId)
        {
            var id = Guid.NewGuid();
            db.McpKeys.Add(new McpKeyEntity
            {
                Id = id,
                UserId = userId,
                Label = "key",
                Prefix = Guid.NewGuid().ToString("N")[..8],
                KeyHash = Guid.NewGuid().ToString("N"),
                Scopes = ["READ"],
                CreatedAt = now,
                LastUsedAt = now
            });
            return id;
        }

        var firstKeyId = AddKey(ownerId);
        var secondKeyId = AddKey(ownerId);
        var strangerKeyId = AddKey(strangerId);
        await db.SaveChangesAsync();

        return new Seeded(ownerId, strangerId, firstKeyId, secondKeyId, strangerKeyId);
    }

    [DbFact]
    public async Task Batch_revoke_revokes_every_selected_key()
    {
        await AuthTestDb.EnsureSchemaAsync();
        using var db = AuthTestDb.OpenDb();
        var seeded = await SeedAsync(db);

        var service = new McpKeysService(db);
        var report = await service.RevokeMcpKeysAsync(
            [seeded.FirstKeyId, seeded.SecondKeyId], onlyOwnedBy: null);

        Assert.Equal(2, report.Revoked);
        Assert.Equal(2, report.Ids.Count);
        var revokedAt = await RevokedAtAsync(db, seeded.FirstKeyId, seeded.SecondKeyId);
        Assert.All(revokedAt, at => Assert.NotNull(at));
    }

    [DbFact]
    public async Task Batch_revoke_skips_keys_that_already_are_revoked()
    {
        await AuthTestDb.EnsureSchemaAsync();
        using var db = AuthTestDb.OpenDb();
        var seeded = await SeedAsync(db);

        var service = new McpKeysService(db);
        await service.RevokeMcpKeyAsync(seeded.FirstKeyId, onlyOwnedBy: null);
        var report = await service.RevokeMcpKeysAsync(
            [seeded.FirstKeyId, seeded.SecondKeyId], onlyOwnedBy: null);

        Assert.Equal(1, report.Revoked);
        Assert.Equal(2, report.Ids.Count);
    }

    [DbFact]
    public async Task Batch_revoke_ignores_keys_owned_by_someone_else()
    {
        await AuthTestDb.EnsureSchemaAsync();
        using var db = AuthTestDb.OpenDb();
        var seeded = await SeedAsync(db);

        var service = new McpKeysService(db);
        var report = await service.RevokeMcpKeysAsync(
            [seeded.FirstKeyId, seeded.StrangerKeyId], onlyOwnedBy: seeded.OwnerId);

        Assert.Equal(1, report.Revoked);
        Assert.Equal([seeded.FirstKeyId], report.Ids);
        Assert.Null((await RevokedAtAsync(db, seeded.StrangerKeyId)).Single());
    }

    private static async Task<List<DateTime?>> RevokedAtAsync(AOCDbContext db, params Guid[] ids)
    {
        db.ChangeTracker.Clear();
        var rows = await db.McpKeys.AsNoTracking().Where(k => ids.Contains(k.Id)).ToListAsync();
        return rows.Select(row => row.RevokedAt).ToList();
    }
}
