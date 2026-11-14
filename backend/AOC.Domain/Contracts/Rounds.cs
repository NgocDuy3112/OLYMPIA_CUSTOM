using System.Text.Json;
using System.Text.Json.Serialization;

namespace AOC.Domain.Contracts;


[JsonConverter(typeof(ScoringRuleConverter))]
public abstract record ScoringRule
{
    public sealed record Constant(
        [property: JsonPropertyName("points")] int Points
    ) : ScoringRule;

    public sealed record KeywordDerived(
        [property: JsonPropertyName("initial")] int Initial,
        [property: JsonPropertyName("dropPerHint")] int DropPerHint,
        [property: JsonPropertyName("floor")] int? Floor,
        [property: JsonPropertyName("incorrect")] int Incorrect
    ) : ScoringRule;

    public sealed record RankMultiplier(
        [property: JsonPropertyName("bands")] List<SpeedBand> Bands,
        [property: JsonPropertyName("multipliers")] List<int>? Multipliers,
        [property: JsonPropertyName("ladderTop")] int LadderTop,
        [property: JsonPropertyName("incorrect")] int Incorrect,
        [property: JsonPropertyName("timeBasis")] TimeBasis TimeBasis
    ) : ScoringRule;

    public sealed record OutcomeMultipliers(
        [property: JsonPropertyName("correct")] double Correct,
        [property: JsonPropertyName("incorrect")] double Incorrect,
        [property: JsonPropertyName("powers")] OutcomePowers Powers
    ) : ScoringRule;
}

public sealed record SpeedBand(
    [property: JsonPropertyName("untilSec")] int UntilSec,
    [property: JsonPropertyName("points")] int Points
);

public sealed record OutcomePowers(
    [property: JsonPropertyName("star")] OutcomeStar Star
);

public sealed record OutcomeStar(
    [property: JsonPropertyName("correct")] double Correct,
    [property: JsonPropertyName("incorrect")] double Incorrect
);

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum TimeBasis
{
    [System.Runtime.Serialization.EnumMember(Value = "first")]
    first,
    [System.Runtime.Serialization.EnumMember(Value = "final")]
    final
}

public sealed class ScoringRuleConverter : JsonConverter<ScoringRule>
{
    public override ScoringRule? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        using var doc = JsonDocument.ParseValue(ref reader);
        var root = doc.RootElement;
        if (!root.TryGetProperty("template", out var template))
            throw new JsonException("scoring rule needs a template");

        return template.GetString() switch
        {
            "constant" => new ScoringRule.Constant(root.GetProperty("points").GetInt32()),
            "keyword_derived" => new ScoringRule.KeywordDerived(
                root.GetProperty("initial").GetInt32(),
                root.GetProperty("dropPerHint").GetInt32(),
                root.TryGetProperty("floor", out var floor) && floor.ValueKind == JsonValueKind.Number
                    ? floor.GetInt32()
                    : null,
                root.GetProperty("incorrect").GetInt32()),
            "rank_multiplier" => new ScoringRule.RankMultiplier(
                root.GetProperty("bands").Deserialize<List<SpeedBand>>(options) ?? [],
                root.TryGetProperty("multipliers", out var mult) && mult.ValueKind == JsonValueKind.Array
                    ? mult.Deserialize<List<int>>(options)
                    : null,
                root.GetProperty("ladderTop").GetInt32(),
                root.GetProperty("incorrect").GetInt32(),
                JsonSerializer.Deserialize<TimeBasis>(root.GetProperty("timeBasis").GetRawText(), options)),
            "outcome_multipliers" => new ScoringRule.OutcomeMultipliers(
                root.GetProperty("correct").GetDouble(),
                root.GetProperty("incorrect").GetDouble(),
                root.GetProperty("powers").Deserialize<OutcomePowers>(options)!),
            _ => throw new JsonException($"unknown scoring template \"{template.GetString()}\"")
        };
    }

    public override void Write(Utf8JsonWriter writer, ScoringRule value, JsonSerializerOptions options)
    {
        writer.WriteStartObject();
        switch (value)
        {
            case ScoringRule.Constant constant:
                writer.WriteString("template", "constant");
                writer.WriteNumber("points", constant.Points);
                break;
            case ScoringRule.KeywordDerived keyword:
                writer.WriteString("template", "keyword_derived");
                writer.WriteNumber("initial", keyword.Initial);
                writer.WriteNumber("dropPerHint", keyword.DropPerHint);
                if (keyword.Floor is not null) writer.WriteNumber("floor", keyword.Floor.Value);
                writer.WriteNumber("incorrect", keyword.Incorrect);
                break;
            case ScoringRule.RankMultiplier rank:
                writer.WriteString("template", "rank_multiplier");
                writer.WritePropertyName("bands");
                JsonSerializer.Serialize(writer, rank.Bands, options);
                if (rank.Multipliers is not null)
                {
                    writer.WritePropertyName("multipliers");
                    JsonSerializer.Serialize(writer, rank.Multipliers, options);
                }
                writer.WriteNumber("ladderTop", rank.LadderTop);
                writer.WriteNumber("incorrect", rank.Incorrect);
                writer.WritePropertyName("timeBasis");
                JsonSerializer.Serialize(writer, rank.TimeBasis, options);
                break;
            case ScoringRule.OutcomeMultipliers outcome:
                writer.WriteString("template", "outcome_multipliers");
                writer.WriteNumber("correct", outcome.Correct);
                writer.WriteNumber("incorrect", outcome.Incorrect);
                writer.WritePropertyName("powers");
                JsonSerializer.Serialize(writer, outcome.Powers, options);
                break;
        }
        writer.WriteEndObject();
    }
}

/// <summary>TurnConfig — stored inside round configs (jsonb).</summary>
public sealed record TurnConfig
{
    [JsonPropertyName("id")] public required string Id { get; init; }
    [JsonPropertyName("mode")] public required QuestionMode Mode { get; init; }
    [JsonPropertyName("delivery")] public required DeliveryMode Delivery { get; init; }

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
    public Dictionary<string, int>? SecondsByValue { get; init; }
}

public sealed record RoundConfig
{
    [JsonPropertyName("allowedKinds")] public required List<QuestionKind> AllowedKinds { get; init; }
    [JsonPropertyName("scoring")] public required ScoringRule Scoring { get; init; }
    [JsonPropertyName("turns")] public required List<TurnConfig> Turns { get; init; }
}
