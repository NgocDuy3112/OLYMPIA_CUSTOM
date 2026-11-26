namespace AOC.Api.Realtime;

public sealed record HubSubscriber(
    string UserId,
    Func<PublishScope, CancellationToken, Task> Push,
    Func<Dictionary<string, object?>, Task>? Send = null,
    string Kind = "player");
