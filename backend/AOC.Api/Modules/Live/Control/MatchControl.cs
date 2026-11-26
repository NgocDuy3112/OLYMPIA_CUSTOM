namespace AOC.Api.Modules.Live;

public static class MatchControl
{
    public static readonly TimeSpan StaleAfter = TimeSpan.FromSeconds(90);

    public static bool IsFresh(DateTime? heartbeatAt, DateTime now) =>
        heartbeatAt is { } at && now - at < StaleAfter;

    public static bool CanHold(
        Guid? holderId, DateTime? heartbeatAt, Guid actorId, bool takeover, DateTime now)
    {
        if (takeover) return true;
        if (holderId is null) return true;
        if (holderId == actorId) return true;
        return !IsFresh(heartbeatAt, now);
    }
}
