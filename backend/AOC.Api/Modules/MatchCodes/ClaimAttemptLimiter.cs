namespace AOC.Api.Modules.MatchCodes;

public sealed class ClaimAttemptLimiter
{
    private const int MaxAttempts = 5;
    private static readonly TimeSpan Window = TimeSpan.FromMinutes(15);
    private static readonly TimeSpan Lockout = TimeSpan.FromMinutes(15);

    private sealed record Entry(int Count, DateTime WindowStart, DateTime? LockedUntil);

    private readonly Dictionary<Guid, Entry> entries = [];
    private readonly object gate = new();

    public void AssertAllowed(Guid userId)
    {
        lock (gate)
        {
            if (!entries.TryGetValue(userId, out var entry)) return;
            if (entry.LockedUntil is null) return;
            if (entry.LockedUntil > DateTime.UtcNow)
                throw new CodeError(CodeErrorCode.CONFLICT,
                    "quá nhiều lần thử vào trận — vui lòng thử lại sau.");
            entries.Remove(userId);
        }
    }

    public void RegisterFailure(Guid userId)
    {
        lock (gate)
        {
            var now = DateTime.UtcNow;
            int count;
            DateTime windowStart;
            if (entries.TryGetValue(userId, out var entry) && now - entry.WindowStart <= Window)
            {
                count = entry.Count + 1;
                windowStart = entry.WindowStart;
            }
            else
            {
                count = 1;
                windowStart = now;
            }
            DateTime? lockedUntil = count >= MaxAttempts ? now + Lockout : null;
            entries[userId] = new Entry(count, windowStart, lockedUntil);
        }
    }

    public void Reset(Guid userId)
    {
        lock (gate) entries.Remove(userId);
    }
}
