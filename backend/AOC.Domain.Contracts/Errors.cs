namespace AOC.Domain.Contracts;

public class TournamentRuleError : Exception
{
    public TournamentRuleError(string message) : base(message)
    {
        Name = "TournamentRuleError";
    }

    public string Name { get; }
}

public class RuleError : Exception
{
    public RuleError(string code, string message) : base(message)
    {
        Code = code;
    }

    public string Code { get; }
}

public static class Fail
{
    public static RuleError At(string code, string message) => new(code, message);
}

public class VeDichRuleError : Exception
{
    public VeDichRuleError(string code, string message) : base(message)
    {
        Code = code;
    }

    public string Code { get; }
}
