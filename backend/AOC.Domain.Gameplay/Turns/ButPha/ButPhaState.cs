using System.Text.Json.Serialization;
using AOC.Domain.Contracts;

namespace AOC.Domain.Gameplay.Turns;

public sealed record ButPhaState
{
    [JsonPropertyName("rules")] public RoundRules.ButPhaRules Rules { get; init; } = RuleBatches.ButPha;
    [JsonPropertyName("questionIds")] public List<string> QuestionIds { get; init; } = [];
    [JsonPropertyName("cursor")] public int Cursor { get; init; }
    [JsonPropertyName("questionRevealedAt")] public string? QuestionRevealedAt { get; init; }

    [JsonPropertyName("window")]
    public AnswerWindow Window { get; init; } = AnswerWindow.TypedEveryone(RuleBatches.ButPha.QuestionLimitS);
    [JsonPropertyName("answers")] public Dictionary<string, List<ButPhaAnswer>> Answers { get; init; } = new();
    [JsonPropertyName("points")] public Dictionary<string, Dictionary<string, int>> Points { get; init; } = new();
    [JsonPropertyName("ended")] public bool Ended { get; init; }

    [JsonPropertyName("revealedAnswer")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? RevealedAnswer { get; init; }
}
