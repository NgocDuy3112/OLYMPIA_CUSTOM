using System.Text.Json.Serialization;

namespace AOC.Domain.Contracts;

[JsonConverter(typeof(SubmittedAnswerValueConverter))]
public abstract record SubmittedAnswerValue
{
    public sealed record Picked([property: JsonPropertyName("picked")] List<string> Items) : SubmittedAnswerValue;
    public sealed record Text([property: JsonPropertyName("text")] string Value) : SubmittedAnswerValue;
}
