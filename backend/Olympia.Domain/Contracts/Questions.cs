using System.Text.Json;
using System.Text.Json.Serialization;

namespace Olympia.Domain.Contracts;

public sealed record Media(
    [property: JsonPropertyName("url")] string Url,
    [property: JsonPropertyName("type")] MediaKind Type
);

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum MediaKind
{
    image,
    audio,
    video
}

[JsonConverter(typeof(QuestionPayloadConverter))]
public abstract record QuestionPayload
{
    [JsonPropertyName("type")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public QuestionTypeValue? Type { get; init; }

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

public sealed record ChoiceOption(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("text")] string Text
);

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

        if (root.TryGetProperty("type", out var typeEl) && typeEl.ValueKind == JsonValueKind.String)
        {
            payload = payload with { Type = JsonSerializer.Deserialize<QuestionTypeValue>(typeEl.GetRawText(), options) };
        }
        return payload;
    }

    public override void Write(Utf8JsonWriter writer, QuestionPayload value, JsonSerializerOptions options)
    {
        writer.WriteStartObject();
        if (value.Type is not null)
        {
            writer.WritePropertyName("type");
            JsonSerializer.Serialize(writer, value.Type.Value, options);
        }
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


public sealed record MatchQuestion
{
    [JsonPropertyName("_id")] public required string Id { get; init; }
    [JsonPropertyName("roundId")] public required string RoundId { get; init; }
    [JsonPropertyName("turnId")] public required string TurnId { get; init; }
    [JsonPropertyName("position")] public required int Position { get; init; }
    [JsonPropertyName("mode")] public required QuestionMode Mode { get; init; }
    [JsonPropertyName("kind")] public required QuestionKind Kind { get; init; }
    [JsonPropertyName("questionText")] public required string QuestionText { get; init; }
    [JsonPropertyName("media")] public Media? Media { get; init; }
    [JsonPropertyName("timeLimit")] public int? TimeLimit { get; init; }
    [JsonPropertyName("points")] public required int Points { get; init; }
    [JsonPropertyName("payload")] public required QuestionPayload Payload { get; init; }
    [JsonPropertyName("sourceId")] public required string SourceId { get; init; }
}
