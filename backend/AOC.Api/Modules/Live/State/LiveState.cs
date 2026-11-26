using System.Text.Json;
using AOC.Api.Http;
using AOC.Domain.Contracts;
using AOC.Domain.Gameplay;
using AOC.Infrastructure.Data;
using AOC.Domain.Gameplay.Turns;

namespace AOC.Api.Modules.Live;

public static partial class LiveState
{
    public static bool IsWaitingMarker(JsonElement raw)
    {
        if (raw.ValueKind != JsonValueKind.Object) return false;
        foreach (var prop in raw.EnumerateObject())
        {
            if (prop.Name != "waiting") continue;
            return prop.Value.ValueKind switch
            {
                JsonValueKind.True => true,
                JsonValueKind.False => false,
                _ => throw new LiveStateError("stored live state failed validation",
                    ["waiting: expected boolean"])
            };
        }
        return false;
    }

    private static T Parse<T>(
        JsonElement raw,
        Action<JsonElement, List<string>> validate,
        Func<JsonElement, T, T>? upgrade = null)
    {
        var details = new List<string>();
        if (IsWaitingMarker(raw))
        {
            // the round is paused (controller back at the lobby) — deserialize defaults
            return JsonSerializer.Deserialize<T>(JsonDefaults.EmptyObject, JsonApi.Options)!;
        }
        if (raw.ValueKind != JsonValueKind.Object)
            details.Add("<root>: expected object");
        else
            validate(raw, details);

        if (details.Count > 0)
            throw new LiveStateError("stored live state failed validation", details.Take(5).ToList());

        try
        {
            var state = JsonSerializer.Deserialize<T>(raw, JsonApi.Options)!;
            return upgrade is null ? state : upgrade(raw, state);
        }
        catch (JsonException ex)
        {
            throw new LiveStateError("stored live state failed validation", [$"<root>: {ex.Message}"]);
        }
    }

    private static void OptionalRevealedAnswer(JsonElement raw, List<string> details)
    {
        if (raw.TryGetProperty("revealedAnswer", out var revealed))
            if (revealed.ValueKind is not (JsonValueKind.String or JsonValueKind.Null))
                details.Add("revealedAnswer: expected string or null");
    }

    private static void ValidateQuestion(JsonElement q, List<string> details, string path)
    {
        StateGuard.RequireString(q, "id", details, path);
        StateGuard.RequireInteger(q, "value", details, path);
    }

    public static object ParseRoundState(string roundId, JsonElement raw) => roundId switch
    {
        "giai-ma" => ParseGiaiMa(raw),
        "but-pha" => ParseButPha(raw),
        "khoi-dong" => ParseKhoiDong(raw),
        "ve-dich" => ParseVeDich(raw),
        _ => throw new LiveStateError($"no state schema for round \"{roundId}\"")
    };
}
