using System.Text.Json.Serialization;

namespace AOC.Domain.Contracts;

[JsonConverter(typeof(AnswerValueConverter))]
public abstract record AnswerValue
{
    public sealed record Picked([property: JsonPropertyName("picked")] List<string> Items) : AnswerValue;
    public sealed record Text([property: JsonPropertyName("text")] string Value) : AnswerValue;
    public sealed record Oral : AnswerValue
    {
        [JsonPropertyName("oral")] public bool OralFlag => true;
    }
}
