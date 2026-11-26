namespace AOC.Domain.Gameplay.Turns;

/// <summary>What the operator's console may do with the open question right now.
/// Each flag answers the same guard its mutation enforces, so the console reads
/// the rule instead of restating it.</summary>
public sealed record VeDichCapabilities
{
    public required bool CanOpenQuestion { get; init; }
    public required bool CanSwitchQuestion { get; init; }
    public required bool CanReveal { get; init; }
    public required bool CanStartClock { get; init; }
    public required bool CanCloseCurrentAnswer { get; init; }
    public required bool CanLockBuzz { get; init; }
    public required bool CanCloseQuestion { get; init; }
    public required bool CanResolve { get; init; }
    public required bool CanStorePower { get; init; }
    public required bool CanUnstagePower { get; init; }
}
