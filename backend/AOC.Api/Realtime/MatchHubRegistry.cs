namespace AOC.Api.Realtime;

public sealed record HubSubscriber(
    string UserId,
    Func<Task> Push,
    Func<Dictionary<string, object?>, Task>? Send = null,
    string Kind = "player");

public sealed class MatchHubRegistry(ILogger<MatchHubRegistry> logger)
{
    public const string ConsoleSubscriber = "__console__";

    private readonly object _gate = new();
    private readonly Dictionary<string, HashSet<HubSubscriber>> _byMatch = new();

    public Action Subscribe(string matchId, HubSubscriber subscriber)
    {
        lock (_gate)
        {
            if (!_byMatch.TryGetValue(matchId, out var set))
            {
                set = new HashSet<HubSubscriber>();
                _byMatch[matchId] = set;
            }
            set.Add(subscriber);
        }

        return () =>
        {
            lock (_gate)
            {
                if (_byMatch.TryGetValue(matchId, out var set))
                {
                    set.Remove(subscriber);
                    if (set.Count == 0) _byMatch.Remove(matchId);
                }
            }
        };
    }

    public async Task PublishAsync(string matchId)
    {
        List<HubSubscriber> targets;
        lock (_gate)
        {
            if (!_byMatch.TryGetValue(matchId, out var set) || set.Count == 0) return;
            targets = set.ToList();
        }

        foreach (var subscriber in targets)
        {
            try
            {
                await subscriber.Push();
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "live push to a subscriber of match {MatchId} failed", matchId);
            }
        }
    }

    public async Task BroadcastAsync(string matchId, Dictionary<string, object?> envelope, params string[] kinds)
    {
        List<HubSubscriber> targets;
        lock (_gate)
        {
            if (!_byMatch.TryGetValue(matchId, out var set) || set.Count == 0) return;
            targets = set.Where(s => s.Send is not null && kinds.Contains(s.Kind)).ToList();
        }

        foreach (var subscriber in targets)
        {
            try
            {
                await subscriber.Send!(envelope);
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "sfx push to a {Kind} of match {MatchId} failed", subscriber.Kind, matchId);
            }
        }
    }

    public int SubscriberCount(string matchId)
    {
        lock (_gate)
        {
            return _byMatch.TryGetValue(matchId, out var set) ? set.Count : 0;
        }
    }

    public List<string> ConnectedUsers(string matchId)
    {
        lock (_gate)
        {
            if (!_byMatch.TryGetValue(matchId, out var set)) return [];
            return set.Select(s => s.UserId)
                .Where(id => id != ConsoleSubscriber)
                .Distinct()
                .ToList();
        }
    }
}
