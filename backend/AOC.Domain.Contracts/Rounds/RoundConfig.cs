using System.Text.Json;
using System.Text.Json.Serialization;

namespace AOC.Domain.Contracts;

public sealed record RoundConfig
{
    [JsonPropertyName("allowedKinds")] public required List<QuestionKind> AllowedKinds { get; init; }
    [JsonPropertyName("scoring")] public required ScoringRule Scoring { get; init; }
    [JsonPropertyName("turns")] public required List<TurnConfig> Turns { get; init; }

    [JsonPropertyName("rules")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public JsonElement? Rules { get; init; }
}
