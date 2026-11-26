using System.Collections.Concurrent;
using AOC.Api.Modules.Live;

namespace AOC.Api.Realtime;

public sealed class PublishScope
{
    private readonly ConcurrentDictionary<Guid, Lazy<Task<MatchController?>>> controllers = new();

    public Task<MatchController?> ControllerOfAsync(Guid matchId, Func<Guid, Task<MatchController?>> read)
        => controllers
            .GetOrAdd(matchId, id => new Lazy<Task<MatchController?>>(() => read(id)))
            .Value;
}
