using System.Text.Json.Serialization;

namespace AOC.Domain.Gameplay.Turns;

public sealed record Phase1Result(
    [property: JsonPropertyName("correct")] bool Correct,
    [property: JsonPropertyName("points")] int Points
);
