namespace AOC.Api.Modules.MatchCodes;

public enum CodeErrorCode
{
    VALIDATION,
    FORBIDDEN,
    NOT_FOUND,
    CONFLICT
}

public sealed class CodeError : Exception
{
    public CodeError(CodeErrorCode code, string message, IReadOnlyList<string>? details = null)
        : base(message)
    {
        Code = code;
        Details = details ?? [];
    }

    public CodeErrorCode Code { get; }
    public IReadOnlyList<string> Details { get; }

    public int Status => Code switch
    {
        CodeErrorCode.VALIDATION => 400,
        CodeErrorCode.FORBIDDEN => 403,
        CodeErrorCode.NOT_FOUND => 404,
        _ => 409
    };
}
