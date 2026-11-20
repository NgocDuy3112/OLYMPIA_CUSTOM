using System.Text.Json;
using System.Text.Json.Serialization;

namespace AOC.Domain.Contracts;

public sealed class SubmittedAnswerValueConverter : JsonConverter<SubmittedAnswerValue>
{
    public override SubmittedAnswerValue? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        using var doc = JsonDocument.ParseValue(ref reader);
        var root = doc.RootElement;
        if (root.ValueKind != JsonValueKind.Object) throw new JsonException("answer value must be an object");
        if (root.TryGetProperty("picked", out var picked))
            return new SubmittedAnswerValue.Picked(picked.Deserialize<List<string>>(options) ?? []);
        if (root.TryGetProperty("text", out var text))
            return new SubmittedAnswerValue.Text(text.GetString() ?? "");
        throw new JsonException("answer value must have picked or text");
    }

    public override void Write(Utf8JsonWriter writer, SubmittedAnswerValue value, JsonSerializerOptions options)
    {
        writer.WriteStartObject();
        switch (value)
        {
            case SubmittedAnswerValue.Picked picked:
                writer.WritePropertyName("picked");
                JsonSerializer.Serialize(writer, picked.Items, options);
                break;
            case SubmittedAnswerValue.Text text:
                writer.WriteString("text", text.Value);
                break;
        }
        writer.WriteEndObject();
    }
}
