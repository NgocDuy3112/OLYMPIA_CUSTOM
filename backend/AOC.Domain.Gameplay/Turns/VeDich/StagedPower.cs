using System.Text.Json.Serialization;
using AOC.Domain.Contracts;

namespace AOC.Domain.Gameplay.Turns;

public sealed record StagedPower
{
    [JsonPropertyName("power")] public required PowerKind Power { get; init; }

    [JsonPropertyName("targetId")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? TargetId { get; init; }
}
