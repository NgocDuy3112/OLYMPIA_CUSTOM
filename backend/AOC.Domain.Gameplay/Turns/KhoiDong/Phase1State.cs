using System.Text.Json.Serialization;

namespace AOC.Domain.Gameplay.Turns;

public sealed record Phase1State
{
    [JsonPropertyName("kind")] public string Kind { get; init; } = "phase1";
    [JsonPropertyName("budgetS")] public int BudgetS { get; init; }
    [JsonPropertyName("pointsPerCorrect")] public int PointsPerCorrect { get; init; }
    [JsonPropertyName("questionIds")] public List<string> QuestionIds { get; init; } = [];
    [JsonPropertyName("cursor")] public int Cursor { get; init; }
    [JsonPropertyName("elapsedS")] public double ElapsedS { get; init; }
    [JsonPropertyName("results")] public Dictionary<string, Phase1Result> Results { get; init; } = new();
    [JsonPropertyName("ended")] public bool Ended { get; init; }
}
