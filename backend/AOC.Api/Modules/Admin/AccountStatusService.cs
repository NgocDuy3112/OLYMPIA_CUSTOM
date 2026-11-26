using Microsoft.EntityFrameworkCore;
using AOC.Api.Http;
using AOC.Infrastructure.Data;
using AOC.Infrastructure.Data.Entities;

namespace AOC.Api.Modules.Admin;

public sealed class AccountStatusService(AOCDbContext db)
{
    public sealed record PublicAccountStatus(
        Guid UserId,
        string Username,
        string DisplayName,
        UserRole Role,
        DateTime? DisabledAt,
        DateTime CreatedAt);

    public Task<PublicAccountStatus> SetOperatorStatusAsync(Guid userId, bool disabled)
        => SetStatusAsync(userId, disabled, [UserRole.OPERATOR, UserRole.ADMIN]);

    public Task<PublicAccountStatus> SetPlayerStatusAsync(Guid userId, bool disabled)
        => SetStatusAsync(userId, disabled, [UserRole.PLAYER]);

    private async Task<PublicAccountStatus> SetStatusAsync(Guid userId, bool disabled, UserRole[] roles)
    {
        var now = DateTime.UtcNow;

        await using var transaction = await db.Database.BeginTransactionAsync();

        var touched = await db.Users
            .Where(u => u.Id == userId && roles.Contains(u.Role))
            .ExecuteUpdateAsync(setters => setters
                .SetProperty(u => u.DisabledAt, disabled ? now : (DateTime?)null)
                .SetProperty(u => u.TokenVersion, u => u.TokenVersion + 1)
                .SetProperty(u => u.UpdatedAt, now));
        if (touched == 0)
            throw ApiException.NotFound($"no account {userId} with role {string.Join('/', roles)}");

        await db.McpKeys
            .Where(k => k.UserId == userId && k.RevokedAt == null)
            .ExecuteUpdateAsync(setters => setters.SetProperty(k => k.RevokedAt, now));

        await transaction.CommitAsync();

        var row = await db.Users.AsNoTracking().FirstAsync(u => u.Id == userId);
        return new PublicAccountStatus(
            row.Id, row.Username, row.DisplayName, row.Role, row.DisabledAt, row.CreatedAt);
    }
}
