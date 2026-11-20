using System.Text.Json.Serialization;

namespace AOC.Domain.Contracts;

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum AnswerMode
{
    Oral,
    Buzz,
    Typed
}

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum AnswerEligibility
{
    Everyone,
    CurrentTurn,
    Others,
    Pair
}

public sealed record WindowSpec
{
    [JsonPropertyName("mode")] public required AnswerMode Mode { get; init; }
    [JsonPropertyName("eligibility")] public required AnswerEligibility Eligibility { get; init; }

    [JsonPropertyName("seconds")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public int? Seconds { get; init; }

    public void AssertValid()
    {
        if (Mode == AnswerMode.Buzz && Eligibility == AnswerEligibility.Everyone)
            throw Fail.At("INVALID_WINDOW", "a buzz window cannot be open to everyone — the turn player must be excluded");
    }
}
