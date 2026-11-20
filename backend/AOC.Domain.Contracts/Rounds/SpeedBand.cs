using System.Text.Json.Serialization;

namespace AOC.Domain.Contracts;

public sealed record SpeedBand(
    [property: JsonPropertyName("untilSec")] int UntilSec,
    [property: JsonPropertyName("points")] int Points
);
