using System.Text.Json.Serialization;
using AOC.Domain.Contracts;

namespace AOC.Domain.Gameplay.Turns;

public sealed record Phase2State
{
    [JsonPropertyName("kind")] public string Kind { get; init; } = "phase2";
    [JsonPropertyName("pointsPerCorrect")] public int PointsPerCorrect { get; init; }
    [JsonPropertyName("window")]
    public AnswerWindow Window { get; init; } = AnswerWindow.TypedEveryone(RuleBatches.KhoiDong.Phase2WindowS);
    [JsonPropertyName("questionIds")] public List<string> QuestionIds { get; init; } = [];
    [JsonPropertyName("index")] public int Index { get; init; }
    [JsonPropertyName("results")] public Dictionary<string, Dictionary<string, int>> Results { get; init; } = new();
    [JsonPropertyName("closed")] public bool Closed { get; init; }
}
