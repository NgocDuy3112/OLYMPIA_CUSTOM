using Microsoft.EntityFrameworkCore;
using AOC.Api.Http;
using AOC.Api.Modules.Admin;
using AOC.Infrastructure.Data;
using AOC.Infrastructure.Data.Entities;
using AOC.Tests.Auth;
using Xunit;

namespace AOC.Tests.Modules;

public class AccountStatusTests
{
    private sealed record Seeded(Guid OperatorId, Guid PlayerId, Guid OperatorKeyId, Guid PlayerKeyId);

    private static async Task<Seeded> SeedAsync(AOCDbContext db)
    {
        var now = DateTime.UtcNow;
        var operatorId = Guid.NewGuid();
        var playerId = Guid.NewGuid();

        db.Users.Add(new UserEntity
        {
            Id = operatorId,
            Role = UserRole.OPERATOR,
            Username = "status-operator-" + Guid.NewGuid().ToString("N")[..8],
            DisplayName = "Operator",
            TokenVersion = 3,
            CreatedAt = now,
            UpdatedAt = now
        });
        db.Users.Add(new UserEntity
        {
            Id = playerId,
            Role = UserRole.PLAYER,
            Username = "status-player-" + Guid.NewGuid().ToString("N")[..8],
            DisplayName = "Player",
            TokenVersion = 1,
            CreatedAt = now,
            UpdatedAt = now
        });
        await db.SaveChangesAsync();

        var operatorKeyId = Guid.NewGuid();
        var playerKeyId = Guid.NewGuid();
        db.McpKeys.Add(new McpKeyEntity
        {
            Id = operatorKeyId,
            UserId = operatorId,
            Label = "operator key",
            Prefix = Guid.NewGuid().ToString("N")[..8],
            KeyHash = Guid.NewGuid().ToString("N"),
            Scopes = ["READ"],
            CreatedAt = now,
            LastUsedAt = now
        });
        db.McpKeys.Add(new McpKeyEntity
        {
            Id = playerKeyId,
            UserId = playerId,
            Label = "player key",
            Prefix = Guid.NewGuid().ToString("N")[..8],
            KeyHash = Guid.NewGuid().ToString("N"),
            Scopes = ["READ"],
            CreatedAt = now,
            LastUsedAt = now
        });
        await db.SaveChangesAsync();

        return new Seeded(operatorId, playerId, operatorKeyId, playerKeyId);
    }

    private static async Task<DateTime?> RevokedAtAsync(AOCDbContext db, Guid keyId)
    {
        db.ChangeTracker.Clear();
        var row = await db.McpKeys.AsNoTracking().FirstAsync(k => k.Id == keyId);
        return row.RevokedAt;
    }

    [DbFact]
    public async Task Disabling_an_operator_sets_DisabledAt_bumps_token_version_and_revokes_keys()
    {
        await AuthTestDb.EnsureSchemaAsync();
        using var db = AuthTestDb.OpenDb();
        var seeded = await SeedAsync(db);

        var service = new AccountStatusService(db);
        var account = await service.SetOperatorStatusAsync(seeded.OperatorId, disabled: true);

        Assert.NotNull(account.DisabledAt);
        Assert.Equal(UserRole.OPERATOR, account.Role);

        db.ChangeTracker.Clear();
        var user = await db.Users.AsNoTracking().FirstAsync(u => u.Id == seeded.OperatorId);
        Assert.NotNull(user.DisabledAt);
        Assert.Equal(4, user.TokenVersion);
        Assert.NotNull(await RevokedAtAsync(db, seeded.OperatorKeyId));
    }

    [DbFact]
    public async Task Disabling_one_account_leaves_other_keys_untouched()
    {
        await AuthTestDb.EnsureSchemaAsync();
        using var db = AuthTestDb.OpenDb();
        var seeded = await SeedAsync(db);

        var service = new AccountStatusService(db);
        await service.SetOperatorStatusAsync(seeded.OperatorId, disabled: true);

        Assert.Null(await RevokedAtAsync(db, seeded.PlayerKeyId));
        var player = await db.Users.AsNoTracking().FirstAsync(u => u.Id == seeded.PlayerId);
        Assert.Null(player.DisabledAt);
        Assert.Equal(1, player.TokenVersion);
    }

    [DbFact]
    public async Task Enabling_a_player_clears_DisabledAt_and_bumps_token_version()
    {
        await AuthTestDb.EnsureSchemaAsync();
        using var db = AuthTestDb.OpenDb();
        var seeded = await SeedAsync(db);

        var service = new AccountStatusService(db);
        await service.SetPlayerStatusAsync(seeded.PlayerId, disabled: true);
        var enabled = await service.SetPlayerStatusAsync(seeded.PlayerId, disabled: false);

        Assert.Null(enabled.DisabledAt);

        db.ChangeTracker.Clear();
        var user = await db.Users.AsNoTracking().FirstAsync(u => u.Id == seeded.PlayerId);
        Assert.Null(user.DisabledAt);
        Assert.Equal(3, user.TokenVersion);
    }

    [DbFact]
    public async Task Operator_status_route_refuses_a_player_account()
    {
        await AuthTestDb.EnsureSchemaAsync();
        using var db = AuthTestDb.OpenDb();
        var seeded = await SeedAsync(db);

        var service = new AccountStatusService(db);
        var error = await CaptureAsync(() => service.SetOperatorStatusAsync(seeded.PlayerId, disabled: true));

        Assert.Equal(404, error.Status);
        db.ChangeTracker.Clear();
        var player = await db.Users.AsNoTracking().FirstAsync(u => u.Id == seeded.PlayerId);
        Assert.Null(player.DisabledAt);
    }

    [DbFact]
    public async Task Player_status_route_refuses_an_operator_account()
    {
        await AuthTestDb.EnsureSchemaAsync();
        using var db = AuthTestDb.OpenDb();
        var seeded = await SeedAsync(db);

        var service = new AccountStatusService(db);
        var error = await CaptureAsync(() => service.SetPlayerStatusAsync(seeded.OperatorId, disabled: true));

        Assert.Equal(404, error.Status);
        db.ChangeTracker.Clear();
        var user = await db.Users.AsNoTracking().FirstAsync(u => u.Id == seeded.OperatorId);
        Assert.Null(user.DisabledAt);
        Assert.Null(await RevokedAtAsync(db, seeded.OperatorKeyId));
    }

    private static async Task<ApiException> CaptureAsync(Func<Task> action)
    {
        try
        {
            await action();
        }
        catch (ApiException ex)
        {
            return ex;
        }
        throw new InvalidOperationException("expected an ApiException");
    }
}
