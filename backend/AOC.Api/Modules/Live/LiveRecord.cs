namespace AOC.Api.Modules.Live;

public sealed record LiveRecord<S>(int Version, string RoundId, S State, Dictionary<string, S> Archive);
