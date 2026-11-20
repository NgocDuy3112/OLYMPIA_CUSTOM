namespace AOC.Api.Modules.Matches;

public sealed record AssemblyEntry(
    string RoundId,
    string TurnId,
    string SourceId,
    int? Position,
    int? Points);
