using System.Text.Json.Serialization;

namespace AOC.Domain.Contracts;

public sealed record TurnConfig
{
    [JsonPropertyName("id")] public required string Id { get; init; }
    [JsonPropertyName("mode")] public required QuestionMode Mode { get; init; }
    [JsonPropertyName("delivery")] public required DeliveryMode Delivery { get; init; }

    [JsonPropertyName("flow")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public Flow? Flow { get; init; }

    [JsonPropertyName("window")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public WindowSpec? Window { get; init; }

    [JsonPropertyName("buckets")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public List<string>? Buckets { get; init; }

    [JsonPropertyName("timeBudgetSeconds")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public int? TimeBudgetSeconds { get; init; }

    [JsonPropertyName("timeLimitSeconds")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public int? TimeLimitSeconds { get; init; }

    [JsonPropertyName("buzzWindowSeconds")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public int? BuzzWindowSeconds { get; init; }

    [JsonPropertyName("pickCount")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public int? PickCount { get; init; }

    [JsonPropertyName("hintCount")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public int? HintCount { get; init; }

    [JsonPropertyName("questionCount")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public int? QuestionCount { get; init; }

    [JsonPropertyName("secondsByValue")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public Dictionary<int, int>? SecondsByValue { get; init; }
}
