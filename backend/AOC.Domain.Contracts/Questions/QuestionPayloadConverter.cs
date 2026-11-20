using System.Text.Json;
using System.Text.Json.Serialization;

namespace AOC.Domain.Contracts;

public sealed class QuestionPayloadConverter : JsonConverter<QuestionPayload>
{
    public override QuestionPayload? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        using var doc = JsonDocument.ParseValue(ref reader);
        var root = doc.RootElement;
        if (root.ValueKind != JsonValueKind.Object) throw new JsonException("question payload must be an object");

        QuestionPayload? payload = null;
        if (root.TryGetProperty("correctSet", out _))
        {
            var optionsList = root.TryGetProperty("options", out var opts)
                ? opts.Deserialize<List<ChoiceOption>>(options) ?? []
                : [];
            var correctSet = root.GetProperty("correctSet").Deserialize<List<string>>(options) ?? [];
            payload = new QuestionPayload.Choice(optionsList, correctSet);
        }
        else if (root.TryGetProperty("code", out var code))
        {
            payload = new QuestionPayload.Keyword(code.GetString() ?? "");
        }
        else if (root.TryGetProperty("acceptedAnswers", out var answers))
        {
            payload = new QuestionPayload.Text(answers.Deserialize<List<string>>(options) ?? []);
        }

        if (payload is null) throw new JsonException("unknown question payload shape");

        return payload;
    }

    public override void Write(Utf8JsonWriter writer, QuestionPayload value, JsonSerializerOptions options)
    {
        writer.WriteStartObject();
        switch (value)
        {
            case QuestionPayload.Choice choice:
                writer.WritePropertyName("options");
                JsonSerializer.Serialize(writer, choice.Options, options);
                writer.WritePropertyName("correctSet");
                JsonSerializer.Serialize(writer, choice.CorrectSet, options);
                break;
            case QuestionPayload.Text text:
                writer.WritePropertyName("acceptedAnswers");
                JsonSerializer.Serialize(writer, text.AcceptedAnswers, options);
                break;
            case QuestionPayload.Keyword keyword:
                writer.WriteString("code", keyword.Code);
                break;
        }
        writer.WriteEndObject();
    }
}
