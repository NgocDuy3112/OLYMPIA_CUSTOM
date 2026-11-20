using System.Text.Json;
using System.Text.Json.Serialization;

namespace AOC.Domain.Contracts;

public sealed class MatchEventPayloadConverter : JsonConverter<MatchEventPayload>
{
    public override MatchEventPayload? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        using var doc = JsonDocument.ParseValue(ref reader);
        var root = doc.RootElement;
        var kind = root.GetProperty("kind").GetString();
        return kind switch
        {
            "PICK" => new MatchEventPayload.Pick(
                "PICK",
                root.TryGetProperty("turnId", out var turnId) ? turnId.GetString() ?? "" : "",
                root.TryGetProperty("pickOrder", out var order) ? order.GetInt32() : 0),
            "BUZZ" => new MatchEventPayload.Buzz(
                "BUZZ",
                root.TryGetProperty("buzzMs", out var ms) ? ms.GetInt32() : 0,
                root.TryGetProperty("won", out var won) && won.ValueKind == JsonValueKind.True),
            "POWER" => new MatchEventPayload.PowerEvent(
                "POWER",
                root.TryGetProperty("power", out var power)
                    ? JsonSerializer.Deserialize<PowerKind>(power.GetRawText(), options)
                    : PowerKind.STAR,
                root.TryGetProperty("targetId", out var targetId) && targetId.ValueKind == JsonValueKind.String
                    ? targetId.GetString()
                    : null),
            _ => throw new JsonException($"unknown match event kind \"{kind}\"")
        };
    }

    public override void Write(Utf8JsonWriter writer, MatchEventPayload value, JsonSerializerOptions options)
    {
        writer.WriteStartObject();
        switch (value)
        {
            case MatchEventPayload.Pick pick:
                writer.WriteString("kind", "PICK");
                writer.WriteString("turnId", pick.TurnId);
                writer.WriteNumber("pickOrder", pick.PickOrder);
                break;
            case MatchEventPayload.Buzz buzz:
                writer.WriteString("kind", "BUZZ");
                writer.WriteNumber("buzzMs", buzz.BuzzMs);
                writer.WriteBoolean("won", buzz.Won);
                break;
            case MatchEventPayload.PowerEvent power:
                writer.WriteString("kind", "POWER");
                writer.WritePropertyName("power");
                JsonSerializer.Serialize(writer, power.PowerValue, options);
                if (power.TargetId is not null) writer.WriteString("targetId", power.TargetId);
                break;
        }
        writer.WriteEndObject();
    }
}
