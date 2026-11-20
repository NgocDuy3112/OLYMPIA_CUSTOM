using System.Text.Json.Serialization;

namespace AOC.Domain.Contracts;

[JsonConverter(typeof(QuestionPayloadConverter))]
public abstract record QuestionPayload
{
    public sealed record Choice(
        [property: JsonPropertyName("options")] List<ChoiceOption> Options,
        [property: JsonPropertyName("correctSet")] List<string> CorrectSet
    ) : QuestionPayload;

    public sealed record Text(
        [property: JsonPropertyName("acceptedAnswers")] List<string> AcceptedAnswers
    ) : QuestionPayload;

    public sealed record Keyword(
        [property: JsonPropertyName("code")] string Code
    ) : QuestionPayload;
}
