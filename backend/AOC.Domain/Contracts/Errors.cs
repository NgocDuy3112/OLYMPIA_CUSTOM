namespace AOC.Domain.Contracts;

public class TournamentRuleError : Exception
{
    public TournamentRuleError(string message) : base(message)
    {
        Name = "TournamentRuleError";
    }

    public string Name { get; }
}
