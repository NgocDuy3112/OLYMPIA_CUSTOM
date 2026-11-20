namespace AOC.Api.Modules.Live.TieBreak;

public sealed record TieBreakPlayerView(
    string Id,
    string DisplayName,
    int Points,
    int Rank,
    bool Eliminated);
