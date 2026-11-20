namespace AOC.Api.Realtime;

public sealed record HubSubscriber(
    string UserId,
    Func<Task> Push,
    Func<Dictionary<string, object?>, Task>? Send = null,
    string Kind = "player");
