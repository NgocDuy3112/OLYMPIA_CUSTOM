using System.Text.Json.Serialization;

namespace AOC.Domain.Gameplay.Turns;

public sealed record VeDichQuestion
{
    [JsonPropertyName("id")] public required string Id { get; init; }
    [JsonPropertyName("value")] public required int Value { get; init; }
}
