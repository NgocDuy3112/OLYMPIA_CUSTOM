using System.Text.Json.Serialization;

namespace AOC.Domain.Contracts;

public sealed record OutcomeStar(
    [property: JsonPropertyName("correct")] double Correct,
    [property: JsonPropertyName("incorrect")] double Incorrect
);
