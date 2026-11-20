using System.Text.Json.Serialization;

namespace AOC.Domain.Gameplay.Turns;

public sealed record GiaiMaPlayer
{
    [JsonPropertyName("id")] public required string Id { get; init; }
    [JsonPropertyName("hintsRevealed")] public int HintsRevealed { get; init; }
    [JsonPropertyName("revealed")] public List<string> Revealed { get; init; } = [];
    [JsonPropertyName("keywordLocked")] public bool KeywordLocked { get; init; }
    [JsonPropertyName("keywordPoints")] public int KeywordPoints { get; init; }
    [JsonPropertyName("eliminated")] public bool Eliminated { get; init; }
}
