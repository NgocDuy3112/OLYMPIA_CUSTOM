using System.Text.Json;
using Olympia.Domain.Contracts;

namespace Olympia.Api.Modules.Live;

/// <summary>Port of live/facts.ts — what a transition writes besides new state.</summary>
public abstract record LiveFact;

public sealed record AnswerFact(
    string QuestionId,
    string UserId,
    JsonElement Value,
    Verdict Verdict,
    int PointsAwarded,
    bool AutoMatched) : LiveFact
{
    public const string TypeName = "answer";
}

public sealed record DraftFact(
    string QuestionId,
    string UserId,
    JsonElement Value,
    Verdict Suggestion) : LiveFact
{
    public const string TypeName = "draft";
}

public sealed record EventFact(
    string QuestionId,
    string UserId,
    string? RoundId,
    MatchEventKind Kind,
    JsonElement Payload) : LiveFact
{
    public const string TypeName = "event";
}

public sealed record JudgeFact(
    string QuestionId,
    string UserId,
    Verdict Verdict,
    int PointsAwarded) : LiveFact
{
    public const string TypeName = "judge";
}

public sealed record AdjustFact(
    string UserId,
    int Delta,
    string Reason,
    string ActorId) : LiveFact
{
    public const string TypeName = "adjust";
}

public enum MatchEventKind
{
    PICK,
    BUZZ,
    POWER
}

/// <summary>Fact constructors matching the TS literal shapes.</summary>
public static class Facts
{
    public static AnswerFact Oral(string questionId, string userId, Verdict verdict, int points) =>
        new(questionId, userId, JsonSerializer.SerializeToElement(new { oral = true }, JsonApiOptions.Options),
            verdict, points, false);

    public static DraftFact Draft(string questionId, string userId, string text, Verdict suggestion)
    {
        var value = JsonSerializer.SerializeToElement(new { text }, JsonApiOptions.Options);
        return new DraftFact(questionId, userId, value, suggestion);
    }

    public static EventFact Pick(string questionId, string userId, string roundId, string turnId, int pickOrder)
    {
        var payload = JsonSerializer.SerializeToElement(
            new { kind = "PICK", turnId, pickOrder }, JsonApiOptions.Options);
        return new EventFact(questionId, userId, roundId, MatchEventKind.PICK, payload);
    }

    public static EventFact Buzz(string questionId, string userId, string roundId, int buzzMs)
    {
        var payload = JsonSerializer.SerializeToElement(
            new { kind = "BUZZ", buzzMs, won = true }, JsonApiOptions.Options);
        return new EventFact(questionId, userId, roundId, MatchEventKind.BUZZ, payload);
    }

    public static EventFact Power(string questionId, string userId, string roundId, Power power, string? targetId)
    {
        JsonElement payload;
        if (targetId is null)
        {
            payload = JsonSerializer.SerializeToElement(
                new { kind = "POWER", power }, JsonApiOptions.Options);
        }
        else
        {
            payload = JsonSerializer.SerializeToElement(
                new { kind = "POWER", power, targetId }, JsonApiOptions.Options);
        }
        return new EventFact(questionId, userId, roundId, MatchEventKind.POWER, payload);
    }
}

/// <summary>Small holder so Facts can serialize with the shared options.</summary>
internal static class JsonApiOptions
{
    public static readonly JsonSerializerOptions Options = Http.JsonApi.Options;
}
