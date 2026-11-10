using System.Runtime.Serialization;
using System.Text.Json.Serialization;

namespace Olympia.Domain.Contracts;

/// <summary>Shared primitive kinds and enums used across contracts.</summary>
public static class Primitives
{
    public const string UuidPattern = "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$";
}

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum QuestionKind
{
    CHOICE,
    TEXT,
    KEYWORD,
    HINT
}

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum Verdict
{
    CORRECT,
    INCORRECT
}

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum Power
{
    STAR,
    ASSIGN
}

/// <summary>Round delivery mode: "oral" | "text".</summary>
[JsonConverter(typeof(JsonStringEnumConverter))]
public enum QuestionMode
{
    [EnumMember(Value = "oral")]
    oral,
    [EnumMember(Value = "text")]
    text
}

/// <summary>Turn delivery: sequential | batch | pick.</summary>
[JsonConverter(typeof(JsonStringEnumConverter))]
public enum DeliveryMode
{
    [EnumMember(Value = "sequential")]
    sequential,
    [EnumMember(Value = "batch")]
    batch,
    [EnumMember(Value = "pick")]
    pick
}

/// <summary>Question payload type discriminator (optional in stored payloads).</summary>
[JsonConverter(typeof(JsonStringEnumConverter))]
public enum QuestionTypeValue
{
    TEXT,
    ORAL,
    CHOICE,
    KEYWORD
}
