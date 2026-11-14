namespace AOC.Api.Modules.Questions;

public enum QuestionErrorCode
{
    VALIDATION,
    NOT_FOUND,
    FORBIDDEN,
    INVALID_TRANSITION,
    IMMUTABLE
}

public sealed class QuestionError : Exception
{
    public QuestionError(QuestionErrorCode code, string message, IReadOnlyList<string>? details = null)
        : base(message)
    {
        Code = code;
        Details = details ?? [];
    }

    public QuestionErrorCode Code { get; }
    public IReadOnlyList<string> Details { get; }

    public int Status => Code switch
    {
        QuestionErrorCode.VALIDATION => 400,
        QuestionErrorCode.FORBIDDEN => 403,
        QuestionErrorCode.NOT_FOUND => 404,
        _ => 409
    };
}
