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
