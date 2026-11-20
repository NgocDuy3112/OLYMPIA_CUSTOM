using System.Text.Json.Serialization;
using AOC.Domain.Contracts;

namespace AOC.Domain.Gameplay.Turns;

public sealed record GiaiMaState
{
    [JsonPropertyName("rules")] public RoundRules.GiaiMaRules Rules { get; init; } = RuleBatches.GiaiMa;
    [JsonPropertyName("step")] public string Step { get; init; } = "hints";
    [JsonPropertyName("players")] public List<GiaiMaPlayer> Players { get; init; } = [];
    [JsonPropertyName("hintIds")] public List<string> HintIds { get; init; } = [];
    [JsonPropertyName("picked")] public List<string> Picked { get; init; } = [];
    [JsonPropertyName("openHint")] public string? OpenHint { get; init; }

    [JsonPropertyName("hintWindow")]
    public AnswerWindow HintWindow { get; init; } = AnswerWindow.TypedEveryone(RuleBatches.GiaiMa.HintWindowS);

    [JsonPropertyName("keywordClosesAt")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? KeywordClosesAt { get; init; }

    [JsonPropertyName("revealedAnswer")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? RevealedAnswer { get; init; }
}
