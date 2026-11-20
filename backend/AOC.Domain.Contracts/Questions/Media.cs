using System.Text.Json.Serialization;

namespace AOC.Domain.Contracts;

public sealed record Media(
    [property: JsonPropertyName("url")] string Url,
    [property: JsonPropertyName("type")] MediaKind Type
);
