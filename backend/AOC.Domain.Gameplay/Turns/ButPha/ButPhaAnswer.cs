using System.Text.Json.Serialization;

namespace AOC.Domain.Gameplay.Turns;

public sealed record ButPhaAnswer
{
    [JsonPropertyName("playerId")] public required string PlayerId { get; init; }
    [JsonPropertyName("correct")] public required bool Correct { get; init; }
    [JsonPropertyName("atS")] public required double AtS { get; init; }
}
