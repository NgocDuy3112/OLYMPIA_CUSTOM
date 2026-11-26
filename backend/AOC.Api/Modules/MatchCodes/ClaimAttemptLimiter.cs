using Microsoft.EntityFrameworkCore;
using AOC.Infrastructure.Data;

namespace AOC.Api.Modules.MatchCodes;

public sealed class ClaimAttemptLimiter(AOCDbContext db)
{
    private const int MaxAttempts = 5;
    private static readonly TimeSpan Window = TimeSpan.FromMinutes(15);
    private static readonly TimeSpan Lockout = TimeSpan.FromMinutes(15);

    private const string LockedMessage = "quá nhiều lần thử vào trận — vui lòng thử lại sau.";

    public async Task AssertAllowedAsync(Guid userId)
    {
        var now = DateTime.UtcNow;
        var locked = await db.ClaimAttempts.AsNoTracking()
            .AnyAsync(a => a.UserId == userId && a.LockedUntil != null && a.LockedUntil > now);
        if (locked) throw new CodeError(CodeErrorCode.CONFLICT, LockedMessage);
    }

    public Task RegisterFailureAsync(Guid userId) =>
        db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO claim_attempts (user_id, attempts, window_start, locked_until, updated_at)
            VALUES ({userId}, 1, now(), NULL, now())
            ON CONFLICT (user_id) DO UPDATE SET
                attempts = CASE WHEN claim_attempts.window_start > now() - {Window}
                                THEN claim_attempts.attempts + 1
                                ELSE 1 END,
                window_start = CASE WHEN claim_attempts.window_start > now() - {Window}
                                THEN claim_attempts.window_start
                                ELSE now() END,
                locked_until = CASE WHEN claim_attempts.window_start <= now() - {Window}
                                THEN NULL
                                WHEN claim_attempts.attempts + 1 >= {MaxAttempts}
                                THEN now() + {Lockout}
                                ELSE NULL END,
                updated_at = now()
            """);

    public Task ResetAsync(Guid userId) =>
        db.ClaimAttempts.Where(a => a.UserId == userId).ExecuteDeleteAsync();

    public Task PurgeExpiredAsync()
    {
        var now = DateTime.UtcNow;
        return db.ClaimAttempts
            .Where(a => a.WindowStart <= now - Window
                && (a.LockedUntil == null || a.LockedUntil <= now))
            .ExecuteDeleteAsync();
    }
}
