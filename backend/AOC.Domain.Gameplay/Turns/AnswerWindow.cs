using System.Text.Json.Serialization;
using AOC.Domain.Contracts;

namespace AOC.Domain.Gameplay.Turns;

public sealed record AnswerWindow
{
    [JsonPropertyName("mode")] public AnswerMode Mode { get; init; }
    [JsonPropertyName("eligibility")] public AnswerEligibility Eligibility { get; init; }

    [JsonPropertyName("pairA")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? PairA { get; init; }

    [JsonPropertyName("pairB")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? PairB { get; init; }

    [JsonPropertyName("openedAt")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? OpenedAt { get; init; }

    [JsonPropertyName("seconds")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public int? Seconds { get; init; }

    [JsonPropertyName("closesAt")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? ClosesAt { get; init; }

    [JsonPropertyName("turnPlayerId")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? TurnPlayerId { get; init; }

    [JsonPropertyName("buzzer")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Buzzer { get; init; }

    [JsonPropertyName("buzzerMs")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public int? BuzzerMs { get; init; }

    [JsonPropertyName("locked")] public bool Locked { get; init; }

    public static AnswerWindow OralCurrentTurn(string turnPlayerId) => new()
    {
        Mode = AnswerMode.Oral,
        Eligibility = AnswerEligibility.CurrentTurn,
        TurnPlayerId = turnPlayerId
    };

    public static AnswerWindow TypedEveryone(int seconds) => new()
    {
        Mode = AnswerMode.Typed,
        Eligibility = AnswerEligibility.Everyone,
        Seconds = seconds
    };

    public static AnswerWindow TypedCurrentTurn(int seconds, string turnPlayerId) => new()
    {
        Mode = AnswerMode.Typed,
        Eligibility = AnswerEligibility.CurrentTurn,
        Seconds = seconds,
        TurnPlayerId = turnPlayerId
    };

    public static AnswerWindow BuzzOthers(int seconds, string turnPlayerId) => new()
    {
        Mode = AnswerMode.Buzz,
        Eligibility = AnswerEligibility.Others,
        Seconds = seconds,
        TurnPlayerId = turnPlayerId
    };

    public static AnswerWindow BuzzPair(string pairA, string pairB, int seconds) => new()
    {
        Mode = AnswerMode.Buzz,
        Eligibility = AnswerEligibility.Pair,
        PairA = pairA,
        PairB = pairB,
        Seconds = seconds
    };

    public static AnswerWindow KeywordWindow(string nowIso, int seconds)
    {
        AnswerWindow keyword = new()
        {
            Mode = AnswerMode.Typed,
            Eligibility = AnswerEligibility.Everyone
        };
        return keyword.CloseAfter(nowIso, seconds);
    }

    public static AnswerWindow From(WindowSpec spec)
    {
        spec.AssertValid();
        return new AnswerWindow
        {
            Mode = spec.Mode,
            Eligibility = spec.Eligibility,
            Seconds = spec.Seconds
        };
    }

    public AnswerWindow For(string turnPlayerId) => this with { TurnPlayerId = turnPlayerId };

    private static long Ms(string iso)
        => DateTimeOffset.Parse(iso).ToUnixTimeMilliseconds();

    private static string Plus(string iso, double seconds)
        => DateTimeOffset.Parse(iso).AddSeconds(seconds).UtcDateTime
            .ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'");

    public bool HasStarted => OpenedAt is not null || ClosesAt is not null;

    public void AssertValid()
    {
        if (OpenedAt is not null && ClosesAt is not null)
            throw Fail.At("INVALID_WINDOW", "a window either opens now or closes later — not both");
        if (Eligibility == AnswerEligibility.Pair && (PairA is null || PairB is null))
            throw Fail.At("INVALID_WINDOW", "a pair window needs both sides");
    }

    public bool IsOpen(string nowIso)
    {
        if (Locked) return false;
        if (ClosesAt is not null) return Ms(nowIso) <= Ms(ClosesAt);
        if (OpenedAt is null) return false;
        if (Seconds is null) return true;
        return Ms(nowIso) - Ms(OpenedAt) <= Seconds.Value * 1000;
    }

    public string? Deadline()
    {
        if (ClosesAt is not null) return ClosesAt;
        if (OpenedAt is null) return null;
        if (Seconds is null) return null;
        return Plus(OpenedAt, Seconds.Value);
    }

    public int ElapsedMs(string nowIso)
    {
        if (OpenedAt is null)
            throw Fail.At("WINDOW_NOT_OPEN", "the window has not opened");
        return (int)Math.Max(0, Ms(nowIso) - Ms(OpenedAt));
    }

    public AnswerWindow Open(string nowIso)
    {
        if (OpenedAt is not null)
            throw Fail.At("INVALID_WINDOW", "the window is already open");
        if (ClosesAt is not null)
            throw Fail.At("INVALID_WINDOW", "a pre-open window cannot be opened again");
        return this with { OpenedAt = nowIso };
    }

    public AnswerWindow OpenFor(string nowIso, int seconds)
    {
        if (OpenedAt is not null)
            throw Fail.At("INVALID_WINDOW", "the window is already open");
        if (ClosesAt is not null)
            throw Fail.At("INVALID_WINDOW", "a pre-open window cannot be opened again");
        return this with { OpenedAt = nowIso, Seconds = seconds };
    }

    public AnswerWindow CloseAfter(string nowIso, int seconds)
    {
        if (OpenedAt is not null)
            throw Fail.At("INVALID_WINDOW", "an open window cannot be pre-closed");
        if (ClosesAt is not null)
            throw Fail.At("INVALID_WINDOW", "the window already has a closing time");
        return this with { ClosesAt = Plus(nowIso, seconds) };
    }

    public AnswerWindow Lock()
    {
        if (!HasStarted)
            throw Fail.At("WINDOW_NOT_OPEN", "no window is open to lock");
        return this with { Locked = true };
    }

    public AnswerWindow Close()
        => this with { Locked = true };

    public AnswerWindow ReopenAsBuzz(string turnPlayerId, int seconds, string nowIso)
    {
        if (Mode == AnswerMode.Buzz)
            throw Fail.At("INVALID_WINDOW", "the window is already a buzz window");
        return this with
        {
            Mode = AnswerMode.Buzz,
            Eligibility = AnswerEligibility.Others,
            TurnPlayerId = turnPlayerId,
            PairA = null,
            PairB = null,
            OpenedAt = nowIso,
            Seconds = seconds,
            ClosesAt = null,
            Buzzer = null,
            BuzzerMs = null,
            Locked = false
        };
    }

    public AnswerWindow AssertCanAnswer(string playerId, string nowIso)
    {
        AssertValid();

        if (Locked)
            throw Fail.At("WINDOW_CLOSED", "the answer window is locked");
        if (!HasStarted)
            throw Fail.At("WINDOW_NOT_OPEN", "the answer window has not opened");
        if (!IsOpen(nowIso))
        {
            if (Mode == AnswerMode.Buzz)
                throw Fail.At("TOO_LATE", "the buzz window has passed");
            throw Fail.At("WINDOW_CLOSED", "the answer window has closed");
        }
        if (Mode == AnswerMode.Buzz && Buzzer is not null)
            throw Fail.At("ALREADY_BUZZED", $"{Buzzer} already buzzed");

        if (Eligibility == AnswerEligibility.CurrentTurn && playerId != TurnPlayerId)
            throw Fail.At("NOT_YOUR_TURN", "this question is not yours");
        if (Eligibility == AnswerEligibility.Others && playerId == TurnPlayerId)
            throw Fail.At("NOT_YOUR_TURN", "you are answering this question, not buzzing it");
        if (Eligibility == AnswerEligibility.Pair && playerId != PairA && playerId != PairB)
            throw Fail.At("NOT_YOUR_TURN", "this contest is between the two assigned players");

        return this;
    }

    public AnswerWindow Buzz(string playerId, string nowIso)
    {
        if (Mode != AnswerMode.Buzz)
            throw Fail.At("WINDOW_NOT_OPEN", "this window is not a buzz window");
        if (OpenedAt is null)
            throw Fail.At("WINDOW_NOT_OPEN", "the buzz window has not opened");

        AssertCanAnswer(playerId, nowIso);
        return this with { Buzzer = playerId, BuzzerMs = ElapsedMs(nowIso) };
    }
}
