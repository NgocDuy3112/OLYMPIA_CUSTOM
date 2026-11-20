using System.Text.Json.Serialization;
using AOC.Domain.Contracts;

namespace AOC.Domain.Gameplay.Turns;

public sealed record VeDichPlayerState
{
    [JsonPropertyName("id")] public required string Id { get; init; }
    [JsonPropertyName("score")] public int Score { get; init; }

    [JsonPropertyName("powers")]
    public PowerSet Powers { get; init; } = PowerSet.Fresh();
}
