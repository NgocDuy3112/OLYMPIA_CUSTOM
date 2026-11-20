namespace AOC.Api.Modules.Live.TieBreak;

public abstract record TieBreakAction
{
    public sealed record Start(IReadOnlyList<string> PlayerIds) : TieBreakAction;
    public sealed record OpenBuzz : TieBreakAction;
    public sealed record LockBuzz : TieBreakAction;
    public sealed record Judge(bool Correct) : TieBreakAction;
    public sealed record Advance : TieBreakAction;
    public sealed record End : TieBreakAction;
}
