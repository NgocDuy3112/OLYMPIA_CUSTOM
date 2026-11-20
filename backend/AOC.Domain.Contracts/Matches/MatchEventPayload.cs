using System.Text.Json.Serialization;

namespace AOC.Domain.Contracts;

[JsonConverter(typeof(MatchEventPayloadConverter))]
public abstract record MatchEventPayload
{
    public sealed record Pick(
        [property: JsonPropertyName("kind")] string Kind = "PICK",
        [property: JsonPropertyName("turnId")] string TurnId = "",
        [property: JsonPropertyName("pickOrder")] int PickOrder = 0
    ) : MatchEventPayload;

    public sealed record Buzz(
        [property: JsonPropertyName("kind")] string Kind = "BUZZ",
        [property: JsonPropertyName("buzzMs")] int BuzzMs = 0,
        [property: JsonPropertyName("won")] bool Won = false
    ) : MatchEventPayload;

    public sealed record PowerEvent(
        [property: JsonPropertyName("kind")] string Kind = "POWER",
        [property: JsonPropertyName("power")] PowerKind PowerValue = PowerKind.STAR,
        [property: JsonPropertyName("targetId")] string? TargetId = null
    ) : MatchEventPayload;
}
