namespace Olympia.Domain.Contracts;

/// <summary>Port of TournamentRuleError — a rule violation outside a live round.</summary>
public class TournamentRuleError : Exception
{
    public TournamentRuleError(string message) : base(message)
    {
        Name = "TournamentRuleError";
    }

    public string Name { get; }
}
