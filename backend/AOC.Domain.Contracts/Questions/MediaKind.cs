using System.Text.Json.Serialization;

namespace AOC.Domain.Contracts;

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum MediaKind
{
    image,
    audio,
    video
}
