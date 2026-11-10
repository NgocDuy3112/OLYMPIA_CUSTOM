using System.Text.Json;
using System.Text.Json.Serialization;

namespace Olympia.Domain.Contracts;

public sealed record Seat
{
    [JsonPropertyName("kind")] public required string Kind { get; init; } // "user"
    [JsonPropertyName("userId")] public required string UserId { get; init; }
    [JsonPropertyName("seed")] public required int Seed { get; init; }
}

/// <summary>SubmittedAnswerValue: {picked[]} | {text}.</summary>
[JsonConverter(typeof(SubmittedAnswerValueConverter))]
public abstract record SubmittedAnswerValue
{
    public sealed record Picked([property: JsonPropertyName("picked")] List<string> Items) : SubmittedAnswerValue;
    public sealed record Text([property: JsonPropertyName("text")] string Value) : SubmittedAnswerValue;
}

/// <summary>AnswerValue: {picked[]} | {text} | {oral:true}.</summary>
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

/// <summary>answers.drafts (jsonb): { [draftedBy]: "CORRECT" | "INCORRECT" }.</summary>
public sealed class Drafts : Dictionary<string, Verdict>;

/// <summary>matches.live (jsonb) — the open-question marker outside live state.</summary>
public sealed record MatchLive
{
    [JsonPropertyName("phase")] public required MatchLivePhase Phase { get; init; }
    [JsonPropertyName("questionId")] public required string QuestionId { get; init; }
    [JsonPropertyName("openedAt")] public required string OpenedAt { get; init; }
    [JsonPropertyName("deadlineAt")] public required string DeadlineAt { get; init; }
}

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum MatchLivePhase
{
    question_open,
    judging,
    paused
}

public sealed record ResultEntry
{
    [JsonPropertyName("kind")] public required string Kind { get; init; } // "user"
    [JsonPropertyName("userId")] public required string UserId { get; init; }
    [JsonPropertyName("totalScore")] public required int TotalScore { get; init; }
    [JsonPropertyName("rank")] public required int Rank { get; init; }
    [JsonPropertyName("roundScores")] public required Dictionary<string, int> RoundScores { get; init; }
}

public sealed record MatchDiscord
{
    [JsonPropertyName("announcementChannelId")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? AnnouncementChannelId { get; init; }

    [JsonPropertyName("announcementMessageId")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? AnnouncementMessageId { get; init; }

    [JsonPropertyName("liveBoardMessageId")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? LiveBoardMessageId { get; init; }

    [JsonPropertyName("lobbyChannelId")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? LobbyChannelId { get; init; }

    [JsonPropertyName("boothChannelId")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? BoothChannelId { get; init; }
}

/// <summary>match_events.payload (jsonb) — discriminated by "kind".</summary>
[JsonConverter(typeof(MatchEventPayloadConverter))]
public abstract record MatchEventPayload
{
    public sealed record Pick(
        [property: JsonPropertyName("kind")] string Kind = "PICK",
        [property: JsonPropertyName("turnId")] string TurnId = "",
        [property: JsonPropertyName("pickOrder")] int PickOrder = 0
    ) : MatchEventPayload;

    public sealed record Buzz(
        [property: JsonPropertyName("kind")] string Kind = "BUZZ",
        [property: JsonPropertyName("buzzMs")] int BuzzMs = 0,
        [property: JsonPropertyName("won")] bool Won = false
    ) : MatchEventPayload;

    public sealed record PowerEvent(
        [property: JsonPropertyName("kind")] string Kind = "POWER",
        [property: JsonPropertyName("power")] Power PowerValue = Power.STAR,
        [property: JsonPropertyName("targetId")] string? TargetId = null
    ) : MatchEventPayload;
}

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
                    ? JsonSerializer.Deserialize<Power>(power.GetRawText(), options)
                    : Power.STAR,
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
