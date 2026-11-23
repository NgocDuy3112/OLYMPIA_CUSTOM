using System.Text.Json.Serialization;
using AOC.Domain.Contracts;

namespace AOC.Domain.Gameplay.Turns;

public sealed record KhoiDongState
{
    [JsonPropertyName("rules")] public RoundRules.KhoiDongRules Rules { get; init; } = RuleBatches.KhoiDong;
    [JsonPropertyName("flow")] public Flow Flow { get; init; } = Flow.rieng;
    [JsonPropertyName("ended")] public bool Ended { get; init; }
    [JsonPropertyName("order")] public List<string> Order { get; init; } = [];
    [JsonPropertyName("activeIndex")] public int ActiveIndex { get; init; }

    [JsonPropertyName("selectedPlayerId")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? SelectedPlayerId { get; init; }
    [JsonPropertyName("clockStarted")] public bool ClockStarted { get; init; }
    [JsonPropertyName("clockStartedAt")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? ClockStartedAt { get; init; }
    [JsonPropertyName("runs")] public Dictionary<string, Phase1State> Runs { get; init; } = new();
    [JsonPropertyName("phase2")] public Phase2State? Phase2 { get; init; }

    [JsonPropertyName("revealedAnswer")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? RevealedAnswer { get; init; }
}
