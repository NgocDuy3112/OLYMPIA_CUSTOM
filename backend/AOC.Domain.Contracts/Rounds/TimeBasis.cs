using System.Text.Json.Serialization;

namespace AOC.Domain.Contracts;

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum TimeBasis
{
    [System.Runtime.Serialization.EnumMember(Value = "first")]
    first,
    [System.Runtime.Serialization.EnumMember(Value = "final")]
    final
}
