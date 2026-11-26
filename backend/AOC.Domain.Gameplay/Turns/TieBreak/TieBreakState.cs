using System.Text.Json.Serialization;

namespace AOC.Domain.Gameplay.Turns;

public sealed record TieBreakState
{
    [JsonPropertyName("rules")] public TieBreakRules Rules { get; init; } = new();

    [JsonPropertyName("ended")] public bool Ended { get; init; }
    [JsonPropertyName("players")] public List<string> Players { get; init; } = [];
    [JsonPropertyName("eliminated")] public List<string> Eliminated { get; init; } = [];
    [JsonPropertyName("correct")] public Dictionary<string, int> Correct { get; init; } = [];
    [JsonPropertyName("questionIds")] public List<string> QuestionIds { get; init; } = [];
    [JsonPropertyName("cursor")] public int Cursor { get; init; }

    [JsonPropertyName("buzzMs")] public Dictionary<string, int> BuzzMs { get; init; } = [];

    [JsonPropertyName("window")] public AnswerWindow Window { get; init; } = new();
}
