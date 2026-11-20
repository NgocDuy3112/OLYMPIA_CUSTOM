using System.Text.Json.Serialization;

namespace AOC.Domain.Contracts;

public sealed record ChoiceOption(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("text")] string Text
);
