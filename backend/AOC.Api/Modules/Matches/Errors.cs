namespace AOC.Api.Modules.Matches;

public enum MatchErrorCode
{
    VALIDATION,
    FORBIDDEN,
    NOT_FOUND,
    INVALID_TRANSITION,
    IMMUTABLE,
    NOT_READY
}

public sealed class MatchError : Exception
{
    public MatchError(MatchErrorCode code, string message, IReadOnlyList<string>? details = null)
        : base(message)
    {
        Code = code;
        Details = details ?? [];
    }

    public MatchErrorCode Code { get; }
    public IReadOnlyList<string> Details { get; }

    public int Status => Code switch
    {
        MatchErrorCode.VALIDATION => 400,
        MatchErrorCode.FORBIDDEN => 403,
        MatchErrorCode.NOT_FOUND => 404,
        _ => 409
    };
}

/// <summary>Port of matches/assemble-patch.ts StaleRevisionError.</summary>
public sealed class StaleRevisionError(int currentRevision, int sentRevision)
    : Exception($"stale baseRevision {sentRevision} — the match is at revision {currentRevision}; reload and merge")
{
    public int CurrentRevision { get; } = currentRevision;
    public int SentRevision { get; } = sentRevision;
}
