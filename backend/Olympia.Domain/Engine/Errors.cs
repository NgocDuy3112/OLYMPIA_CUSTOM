namespace Olympia.Domain.Engine;

/// <summary>Port of turns/errors.ts — RuleError with a machine-readable code.</summary>
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
    /// <summary>Port of fail(): always throws, returns never.</summary>
    public static RuleError At(string code, string message) => new(code, message);
}

/// <summary>Port of turns/ve-dich.ts VeDichRuleError — carries a detail code.</summary>
public class VeDichRuleError : Exception
{
    public VeDichRuleError(string code, string message) : base(message)
    {
        Code = code;
    }

    public string Code { get; }
}
