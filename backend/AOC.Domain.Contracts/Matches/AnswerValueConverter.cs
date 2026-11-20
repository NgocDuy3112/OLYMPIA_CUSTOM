using System.Text.Json;
using System.Text.Json.Serialization;

namespace AOC.Domain.Contracts;

public sealed class AnswerValueConverter : JsonConverter<AnswerValue>
{
    public override AnswerValue? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        using var doc = JsonDocument.ParseValue(ref reader);
        var root = doc.RootElement;
        if (root.ValueKind != JsonValueKind.Object) throw new JsonException("answer value must be an object");
        if (root.TryGetProperty("picked", out var picked))
            return new AnswerValue.Picked(picked.Deserialize<List<string>>(options) ?? []);
        if (root.TryGetProperty("text", out var text))
            return new AnswerValue.Text(text.GetString() ?? "");
        if (root.TryGetProperty("oral", out var oral) && oral.ValueKind == JsonValueKind.True)
            return new AnswerValue.Oral();
        throw new JsonException("answer value must have picked, text or oral");
    }

    public override void Write(Utf8JsonWriter writer, AnswerValue value, JsonSerializerOptions options)
    {
        writer.WriteStartObject();
        switch (value)
        {
            case AnswerValue.Picked picked:
                writer.WritePropertyName("picked");
                JsonSerializer.Serialize(writer, picked.Items, options);
                break;
            case AnswerValue.Text text:
                writer.WriteString("text", text.Value);
                break;
            case AnswerValue.Oral:
                writer.WriteBoolean("oral", true);
                break;
        }
        writer.WriteEndObject();
    }
}
