using System.Text.Json.Serialization;

namespace AOC.Domain.Contracts;

public sealed record Seat
{
    [JsonPropertyName("kind")] public required string Kind { get; init; }
    [JsonPropertyName("userId")] public required string UserId { get; init; }
    [JsonPropertyName("seed")] public required int Seed { get; init; }
}
