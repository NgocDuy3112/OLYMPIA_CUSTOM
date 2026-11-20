using System.Text.Json.Serialization;

namespace AOC.Domain.Contracts;

public sealed record TournamentRound
{
    [JsonPropertyName("id")] public required string Id { get; init; }
    [JsonPropertyName("name")] public required string Name { get; init; }
    [JsonPropertyName("order")] public required int Order { get; init; }
    [JsonPropertyName("chart")] public required string Chart { get; init; }
}
