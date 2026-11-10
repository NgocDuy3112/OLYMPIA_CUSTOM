using System.Text.Json;
using Olympia.Api.Http;
using Olympia.Domain.Engine.Turns;

namespace Olympia.Api.Modules.Live;

/// <summary>
/// Port of live/state.ts — validate stored live state the way the TypeBox
/// schemas did, then deserialize into the engine state records.
/// </summary>
public static class LiveState
{
    private static T Parse<T>(JsonElement raw, Action<JsonElement, List<string>> validate)
    {
        var details = new List<string>();
        if (raw.ValueKind != JsonValueKind.Object)
            details.Add("<root>: expected object");
        else
            validate(raw, details);

        if (details.Count > 0)
            throw new LiveStateError("stored live state failed validation", details.Take(5).ToList());

        try
        {
            return JsonSerializer.Deserialize<T>(raw, JsonApi.Options)!;
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

    // ---- giai-ma -----------------------------------------------------------------

    public static GiaiMaState ParseGiaiMa(JsonElement raw) => Parse<GiaiMaState>(raw, (obj, details) =>
    {
        StateGuard.RequireOneOf(obj, "stage", ["hints", "ended"], details);
        if (!obj.TryGetProperty("players", out var players) || players.ValueKind != JsonValueKind.Array)
        {
            details.Add("players: expected array");
        }
        else
        {
            foreach (var p in players.EnumerateArray())
            {
                StateGuard.RequireString(p, "id", details, "players[]");
                StateGuard.RequireInteger(p, "hintsRevealed", details, "players[]");
                StateGuard.RequireArray(p, "revealed", details, "players[]");
                StateGuard.RequireBoolean(p, "keywordLocked", details, "players[]");
                StateGuard.RequireInteger(p, "keywordPoints", details, "players[]");
                StateGuard.RequireBoolean(p, "eliminated", details, "players[]");
            }
        }
        StateGuard.RequireArray(obj, "hintIds", details);
        StateGuard.RequireArray(obj, "picked", details);
        StateGuard.RequireNullableString(obj, "openHint", details);
        StateGuard.RequireNullableString(obj, "openHintAt", details);
        OptionalRevealedAnswer(obj, details);
    });

    // ---- but-pha -------------------------------------------------------------------

    public static ButPhaState ParseButPha(JsonElement raw) => Parse<ButPhaState>(raw, (obj, details) =>
    {
        StateGuard.RequireArray(obj, "questionIds", details);
        StateGuard.RequireInteger(obj, "cursor", details);
        StateGuard.RequireNullableString(obj, "questionOpenedAt", details);
        if (!obj.TryGetProperty("answers", out var answers) || answers.ValueKind != JsonValueKind.Object)
        {
            details.Add("answers: expected object");
        }
        else
        {
            foreach (var prop in answers.EnumerateObject())
                if (prop.Value.ValueKind != JsonValueKind.Array)
                    details.Add($"answers.{prop.Name}: expected array");
                else
                    foreach (var a in prop.Value.EnumerateArray())
                    {
                        StateGuard.RequireString(a, "playerId", details, "answers[]");
                        StateGuard.RequireBoolean(a, "correct", details, "answers[]");
                        StateGuard.RequireNumber(a, "atS", details, "answers[]");
                    }
        }
        if (!obj.TryGetProperty("points", out var points) || points.ValueKind != JsonValueKind.Object)
        {
            details.Add("points: expected object");
        }
        else
        {
            foreach (var prop in points.EnumerateObject())
                if (prop.Value.ValueKind != JsonValueKind.Object)
                    details.Add($"points.{prop.Name}: expected object");
                else
                    foreach (var inner in prop.Value.EnumerateObject())
                        StateGuard.RequireInteger(inner.Value, inner.Name, details, "points");
        }
        StateGuard.RequireBoolean(obj, "ended", details);
        OptionalRevealedAnswer(obj, details);
    });

    // ---- khoi-dong -------------------------------------------------------------------

    public static KhoiDongState ParseKhoiDong(JsonElement raw) => Parse<KhoiDongState>(raw, (obj, details) =>
    {
        StateGuard.RequireOneOf(obj, "stage", ["phase1", "phase2"], details);
        StateGuard.RequireBoolean(obj, "ended", details);
        StateGuard.RequireArray(obj, "order", details);
        StateGuard.RequireInteger(obj, "activeIndex", details);
        if (!obj.TryGetProperty("runs", out var runs) || runs.ValueKind != JsonValueKind.Object)
        {
            details.Add("runs: expected object");
        }
        else
        {
            foreach (var prop in runs.EnumerateObject())
            {
                StateGuard.RequireOneOf(prop.Value, "kind", ["phase1"], details, $"runs.{prop.Name}");
                StateGuard.RequireArray(prop.Value, "questionIds", details, $"runs.{prop.Name}");
                StateGuard.RequireInteger(prop.Value, "cursor", details, $"runs.{prop.Name}");
                StateGuard.RequireNumber(prop.Value, "elapsedS", details, $"runs.{prop.Name}");
                if (!prop.Value.TryGetProperty("results", out var results) || results.ValueKind != JsonValueKind.Object)
                {
                    details.Add($"runs.{prop.Name}.results: expected object");
                }
                else
                {
                    foreach (var r in results.EnumerateObject())
                    {
                        StateGuard.RequireBoolean(r.Value, "correct", details, $"runs.{prop.Name}.results");
                        StateGuard.RequireInteger(r.Value, "points", details, $"runs.{prop.Name}.results");
                    }
                }
                StateGuard.RequireBoolean(prop.Value, "ended", details, $"runs.{prop.Name}");
            }
        }
        if (!obj.TryGetProperty("phase2", out var phase2))
        {
            details.Add("phase2: expected object or null");
        }
        else if (phase2.ValueKind == JsonValueKind.Object)
        {
            StateGuard.RequireOneOf(phase2, "kind", ["phase2"], details, "phase2");
            StateGuard.RequireInteger(phase2, "pointsPerCorrect", details, "phase2");
            StateGuard.RequireInteger(phase2, "windowS", details, "phase2");
            StateGuard.RequireArray(phase2, "questionIds", details, "phase2");
            StateGuard.RequireInteger(phase2, "index", details, "phase2");
            StateGuard.RequireNullableString(phase2, "openedAt", details, "phase2");
            if (!phase2.TryGetProperty("results", out var p2results) || p2results.ValueKind != JsonValueKind.Object)
            {
                details.Add("phase2.results: expected object");
            }
            else
            {
                foreach (var prop in p2results.EnumerateObject())
                    if (prop.Value.ValueKind != JsonValueKind.Object)
                        details.Add($"phase2.results.{prop.Name}: expected object");
                    else
                        foreach (var inner in prop.Value.EnumerateObject())
                            StateGuard.RequireInteger(inner.Value, inner.Name, details, "phase2.results");
            }
            StateGuard.RequireBoolean(phase2, "closed", details, "phase2");
        }
        else if (phase2.ValueKind != JsonValueKind.Null)
        {
            details.Add("phase2: expected object or null");
        }
        OptionalRevealedAnswer(obj, details);
    });

    // ---- ve-dich -----------------------------------------------------------------------

    public static VeDichState ParseVeDich(JsonElement raw) => Parse<VeDichState>(raw, (obj, details) =>
    {
        if (!obj.TryGetProperty("phase", out var phase)
            || phase.ValueKind != JsonValueKind.Number || phase.GetInt32() is not (1 or 2))
            details.Add("phase: expected 1 or 2");

        if (!obj.TryGetProperty("players", out var players) || players.ValueKind != JsonValueKind.Array)
        {
            details.Add("players: expected array");
        }
        else
        {
            foreach (var p in players.EnumerateArray())
            {
                StateGuard.RequireString(p, "id", details, "players[]");
                StateGuard.RequireInteger(p, "score", details, "players[]");
                StateGuard.RequireArray(p, "powersLeft", details, "players[]");
            }
        }

        foreach (var arrayName in new[] { "remaining", "pendingPicks" })
            if (!obj.TryGetProperty(arrayName, out var arr) || arr.ValueKind != JsonValueKind.Array)
                details.Add($"{arrayName}: expected array");
            else
                foreach (var q in arr.EnumerateArray())
                    ValidateQuestion(q, details, arrayName);

        if (obj.TryGetProperty("deferred", out var deferred) && deferred.ValueKind == JsonValueKind.Array)
            foreach (var q in deferred.EnumerateArray())
                ValidateQuestion(q, details, "deferred");

        StateGuard.RequireInteger(obj, "turnIndex", details);

        if (!obj.TryGetProperty("open", out var open))
        {
            details.Add("open: expected object or null");
        }
        else if (open.ValueKind == JsonValueKind.Object)
        {
            StateGuard.RequireObjectProp(open, "question", details, "open");
            if (open.TryGetProperty("question", out var q)) ValidateQuestion(q, details, "open.question");
            StateGuard.RequireString(open, "answerer", details, "open");
            if (!open.TryGetProperty("power", out var power)
                || (power.ValueKind != JsonValueKind.String && power.ValueKind != JsonValueKind.Null))
                details.Add("open.power: expected string or null");
            StateGuard.RequireOneOf(open, "stage", ["current", "buzz"], details, "open");
            StateGuard.RequireNullableString(open, "openedAt", details, "open");
            StateGuard.RequireNullableString(open, "buzzer", details, "open");
            if (open.TryGetProperty("buzzerMs", out var buzzerMs)
                && buzzerMs.ValueKind != JsonValueKind.Null
                && (buzzerMs.ValueKind != JsonValueKind.Number || !buzzerMs.TryGetInt32(out _)))
                details.Add("open.buzzerMs: expected integer or null");
            if (open.TryGetProperty("assignedTo", out var assignedTo)
                && assignedTo.ValueKind != JsonValueKind.Null
                && assignedTo.ValueKind != JsonValueKind.String)
                details.Add("open.assignedTo: expected string or null");
        }
        else if (open.ValueKind != JsonValueKind.Null)
        {
            details.Add("open: expected object or null");
        }

        StateGuard.RequireNullableString(obj, "buzzOpenedAt", details);

        if (obj.TryGetProperty("buzzLocked", out var buzzLocked)
            && buzzLocked.ValueKind is not (JsonValueKind.True or JsonValueKind.False))
            details.Add("buzzLocked: expected boolean");

        StateGuard.RequireBoolean(obj, "ended", details);

        if (obj.TryGetProperty("stagedPower", out var staged) && staged.ValueKind == JsonValueKind.Object)
        {
            if (!staged.TryGetProperty("power", out var sp)
                || (sp.ValueKind != JsonValueKind.String
                    && !new[] { "STAR", "ASSIGN" }.Contains(sp.GetString() ?? "")))
                details.Add("stagedPower.power: expected STAR or ASSIGN");
            if (staged.TryGetProperty("targetId", out var targetId)
                && targetId.ValueKind != JsonValueKind.Null
                && targetId.ValueKind != JsonValueKind.String)
                details.Add("stagedPower.targetId: expected string or null");
        }

        if (obj.TryGetProperty("turnPowerUsed", out var tpu)
            && tpu.ValueKind is not (JsonValueKind.True or JsonValueKind.False))
            details.Add("turnPowerUsed: expected boolean");

        OptionalRevealedAnswer(obj, details);
    });

    private static void ValidateQuestion(JsonElement q, List<string> details, string path)
    {
        StateGuard.RequireString(q, "id", details, path);
        StateGuard.RequireInteger(q, "value", details, path);
        if (q.TryGetProperty("timeLimit", out var tl)
            && tl.ValueKind != JsonValueKind.Null
            && (tl.ValueKind != JsonValueKind.Number || !tl.TryGetInt32(out _)))
            details.Add($"{path}.timeLimit: expected integer or null");
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
