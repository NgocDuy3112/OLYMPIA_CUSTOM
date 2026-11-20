using System.Text.Json.Serialization;
using AOC.Domain.Contracts;

namespace AOC.Domain.Gameplay.Turns;

public sealed record OpenQuestion
{
    [JsonPropertyName("question")] public required VeDichQuestion Question { get; init; }
    [JsonPropertyName("answerer")] public required string Answerer { get; init; }
    [JsonPropertyName("power")] public PowerKind? Power { get; init; }

    [JsonPropertyName("window")]
    public AnswerWindow Window { get; init; } = AnswerWindow.OralCurrentTurn("");

    [JsonPropertyName("revealed")] public bool Revealed { get; init; }
}
