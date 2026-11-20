using System.Text.Json.Serialization;

namespace AOC.Domain.Contracts;

public sealed record OutcomePowers(
    [property: JsonPropertyName("star")] OutcomeStar Star
);
