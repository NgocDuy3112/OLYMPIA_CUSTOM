using System.Text.Json.Serialization;
using AOC.Domain.Contracts;

namespace AOC.Domain.Gameplay.Turns;

public sealed record VeDichState
{
    [JsonPropertyName("rules")] public RoundRules.VeDichRules Rules { get; init; } = RuleBatches.VeDich;
    [JsonPropertyName("phase")] public int Phase { get; init; } = 1;
    [JsonPropertyName("players")] public List<VeDichPlayerState> Players { get; init; } = [];
    [JsonPropertyName("remaining")] public List<VeDichQuestion> Remaining { get; init; } = [];

    [JsonPropertyName("deferred")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public List<VeDichQuestion>? Deferred { get; init; }

    [JsonPropertyName("turnIndex")] public int TurnIndex { get; init; }
    [JsonPropertyName("pendingPicks")] public List<VeDichQuestion> PendingPicks { get; init; } = [];
    [JsonPropertyName("open")] public OpenQuestion? Open { get; init; }

    [JsonPropertyName("ended")] public bool Ended { get; init; }

    [JsonPropertyName("turnPicked")] public int TurnPicked { get; init; }

    [JsonPropertyName("picksConfirmed")] public bool PicksConfirmed { get; init; }

    [JsonPropertyName("revealedAnswer")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? RevealedAnswer { get; init; }
}
