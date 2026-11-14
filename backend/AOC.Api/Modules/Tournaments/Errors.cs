namespace AOC.Api.Modules.Tournaments;

public enum TournamentErrorCode
{
    VALIDATION,
    NOT_FOUND,
    CONFLICT,
    FORBIDDEN,
    ALREADY_SETUP,
    NOT_SETUP,
    NOT_OPEN,
    CLOSED,
    ALREADY_ANSWERED,
    NOT_ENROLLED,
    NOT_ENOUGH_PLAYERS,
    TIES_UNRESOLVED,
    NOT_ENOUGH_QUESTIONS
}

public sealed class TournamentError : Exception
{
    public TournamentError(TournamentErrorCode code, string message, IReadOnlyList<string>? details = null)
        : base(message)
    {
        Code = code;
        Details = details ?? [];
    }

    public TournamentErrorCode Code { get; }
    public IReadOnlyList<string> Details { get; }

    public int Status => Code switch
    {
        TournamentErrorCode.VALIDATION => 400,
        TournamentErrorCode.NOT_FOUND => 404,
        TournamentErrorCode.FORBIDDEN => 403,
        TournamentErrorCode.NOT_ENROLLED => 403,
        _ => 409
    };
}
