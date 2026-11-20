using System.Text.Json.Serialization;

namespace AOC.Domain.Contracts;

public sealed record ResultEntry
{
    [JsonPropertyName("kind")] public required string Kind { get; init; }
    [JsonPropertyName("userId")] public required string UserId { get; init; }
    [JsonPropertyName("totalScore")] public required int TotalScore { get; init; }
    [JsonPropertyName("rank")] public required int Rank { get; init; }
    [JsonPropertyName("roundScores")] public required Dictionary<string, int> RoundScores { get; init; }
}
