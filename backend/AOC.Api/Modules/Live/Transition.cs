namespace AOC.Api.Modules.Live;

public sealed record Transition<S>(
    S State,
    List<LiveFact> Facts,
    string? RoundId = null,
    Dictionary<string, S>? Archive = null);
