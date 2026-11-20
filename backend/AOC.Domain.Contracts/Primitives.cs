using System.Runtime.Serialization;
using System.Text.Json.Serialization;

namespace AOC.Domain.Contracts;

public static class Primitives
{
    public const string UuidPattern = "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$";
}

public enum PlayerGroup
{
    A,
    B
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
public enum PowerKind
{
    STAR,
    ASSIGN
}

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum Flow
{
    rieng,
    chung
}

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum QuestionMode
{
    [EnumMember(Value = "oral")]
    oral,
    [EnumMember(Value = "text")]
    text
}

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

