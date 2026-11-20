using System.Text.Json;
using AOC.Api.Http;
using AOC.Domain.Contracts;
using AOC.Domain.Gameplay;
using AOC.Infrastructure.Data;
using AOC.Domain.Gameplay.Turns;

namespace AOC.Api.Modules.Live;

public static class LiveState
{
    private static bool IsWaitingMarker(JsonElement raw)
    {
        if (raw.ValueKind != JsonValueKind.Object) return false;
        foreach (var prop in raw.EnumerateObject())
        {
            if (prop.Name == "waiting") return prop.Value.ValueKind == JsonValueKind.True;
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


    public static GiaiMaState ParseGiaiMa(JsonElement raw)
        => Parse<GiaiMaState>(raw, (obj, details) =>
        {
            StateGuard.RequireOneOf(obj, "step", ["hints", "ended"], details);
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
            StateGuard.RequireOptionalString(obj, "openHintAt", details);
            StateGuard.RequireOptionalBoolean(obj, "openHintLocked", details);
            StateGuard.RequireOptionalString(obj, "keywordOpenedAt", details);
            StateGuard.RequireOptionalString(obj, "keywordClosesAt", details);
            OptionalRevealedAnswer(obj, details);
        }, UpgradeGiaiMa);

    private static GiaiMaState UpgradeGiaiMa(JsonElement raw, GiaiMaState state)
    {
        var next = state;
        if (!raw.TryGetProperty("hintWindow", out _))
            next = next with { HintWindow = HintWindowFrom(raw, state) };
        if (!raw.TryGetProperty("keywordClosesAt", out _))
            next = next with { KeywordClosesAt = KeywordClosesAtFrom(raw, state) };
        return next;
    }

    private static AnswerWindow HintWindowFrom(JsonElement raw, GiaiMaState state)
    {
        var window = AnswerWindow.TypedEveryone(state.Rules.HintWindowS);
        if (raw.TryGetProperty("openHintAt", out var at))
            if (at.ValueKind == JsonValueKind.String)
                window = window.OpenFor(at.GetString()!, state.Rules.HintWindowS);
        if (raw.TryGetProperty("openHintLocked", out var locked))
            if (locked.ValueKind == JsonValueKind.True && window.HasStarted)
                window = window.Lock();
        return window;
    }

    private static string? KeywordClosesAtFrom(JsonElement raw, GiaiMaState state)
    {
        if (!raw.TryGetProperty("keywordOpenedAt", out var opened)) return null;
        if (opened.ValueKind != JsonValueKind.String) return null;
        return DateTimeOffset.Parse(opened.GetString()!)
            .AddSeconds(state.Rules.HintWindowS)
            .UtcDateTime.ToString("yyyy-MM-ddTHH:mm:ss.fffZ");
    }


    public static ButPhaState ParseButPha(JsonElement raw) => Parse<ButPhaState>(raw, (obj, details) =>
    {
        StateGuard.RequireArray(obj, "questionIds", details);
        StateGuard.RequireInteger(obj, "cursor", details);
        StateGuard.RequireOptionalString(obj, "questionOpenedAt", details);
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
                        StateGuard.RequireInteger(prop.Value, inner.Name, details, $"points.{prop.Name}");
        }
        StateGuard.RequireBoolean(obj, "ended", details);
        OptionalRevealedAnswer(obj, details);
    }, UpgradeButPha);

    private static ButPhaState UpgradeButPha(JsonElement raw, ButPhaState state)
    {
        if (raw.TryGetProperty("window", out _)) return state;
        var window = AnswerWindow.TypedEveryone(state.Rules.QuestionLimitS);
        if (raw.TryGetProperty("questionOpenedAt", out var opened))
            if (opened.ValueKind == JsonValueKind.String)
                window = window.OpenFor(opened.GetString()!, state.Rules.QuestionLimitS);
        return state with { Window = window };
    }


    public static KhoiDongState ParseKhoiDong(JsonElement raw) => Parse<KhoiDongState>(raw, (obj, details) =>
    {
        RequireFlow(obj, details);
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
            ValidatePhase2Window(phase2, details);
            StateGuard.RequireArray(phase2, "questionIds", details, "phase2");
            StateGuard.RequireInteger(phase2, "index", details, "phase2");
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
                        {
                            if (inner.Value.ValueKind != JsonValueKind.Number || !inner.Value.TryGetInt32(out _))
                                details.Add($"phase2.results.{inner.Name}: expected integer");
                        }
            }
            StateGuard.RequireBoolean(phase2, "closed", details, "phase2");
        }
        else if (phase2.ValueKind != JsonValueKind.Null)
        {
            details.Add("phase2: expected object or null");
        }
        OptionalRevealedAnswer(obj, details);
    }, UpgradeKhoiDong);

    private static void RequireFlow(JsonElement obj, List<string> details)
    {
        if (obj.TryGetProperty("flow", out _))
        {
            StateGuard.RequireOneOf(obj, "flow", ["rieng", "chung"], details);
            return;
        }
        StateGuard.RequireOneOf(obj, "step", ["phase1", "phase2"], details);
    }

    private static void ValidatePhase2Window(JsonElement phase2, List<string> details)
    {
        if (phase2.TryGetProperty("window", out var window))
        {
            if (window.ValueKind != JsonValueKind.Object)
                details.Add("phase2.window: expected object");
            return;
        }
        StateGuard.RequireInteger(phase2, "windowS", details, "phase2");
        StateGuard.RequireNullableString(phase2, "openedAt", details, "phase2");
    }

    private static KhoiDongState UpgradeKhoiDong(JsonElement raw, KhoiDongState state)
    {
        var next = state;
        if (!raw.TryGetProperty("flow", out _))
            next = next with { Flow = FlowFromStep(raw) };

        if (!raw.TryGetProperty("phase2", out var phase2)) return next;
        if (phase2.ValueKind != JsonValueKind.Object) return next;
        if (next.Phase2 is null) return next;
        return next with { Phase2 = UpgradePhase2(phase2, next.Phase2) };
    }

    private static Flow FlowFromStep(JsonElement raw)
    {
        var step = raw.GetProperty("step").GetString();
        if (step == "phase2") return Flow.chung;
        return Flow.rieng;
    }

    private static Phase2State UpgradePhase2(JsonElement phase2, Phase2State state)
    {
        if (phase2.TryGetProperty("window", out _)) return state;

        var windowS = phase2.GetProperty("windowS").GetInt32();
        var window = AnswerWindow.TypedEveryone(windowS);
        if (phase2.TryGetProperty("openedAt", out var opened))
            if (opened.ValueKind == JsonValueKind.String)
                window = window.OpenFor(opened.GetString()!, windowS);
        return state with { Window = window };
    }


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
                if (p.TryGetProperty("powers", out var powers))
                    ValidatePowerSet(powers, details, "players[]");
                else
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

            if (open.TryGetProperty("window", out var window))
            {
                if (window.ValueKind != JsonValueKind.Object)
                    details.Add("open.window: expected object");
            }
            else
            {
                StateGuard.RequireOneOf(open, "step", ["current", "buzz"], details, "open");
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
        }
        else if (open.ValueKind != JsonValueKind.Null)
        {
            details.Add("open: expected object or null");
        }

        StateGuard.RequireOptionalString(obj, "buzzOpenedAt", details);
        StateGuard.RequireOptionalBoolean(obj, "buzzLocked", details);

        StateGuard.RequireBoolean(obj, "ended", details);

        if (obj.TryGetProperty("stagedPower", out var staged) && staged.ValueKind == JsonValueKind.Object)
        {
            if (!staged.TryGetProperty("power", out var sp)
                || sp.ValueKind != JsonValueKind.String
                || !new[] { "STAR", "ASSIGN" }.Contains(sp.GetString() ?? ""))
                details.Add("stagedPower.power: expected STAR or ASSIGN");
            if (staged.TryGetProperty("targetId", out var targetId)
                && targetId.ValueKind != JsonValueKind.Null
                && targetId.ValueKind != JsonValueKind.String)
                details.Add("stagedPower.targetId: expected string or null");
        }

        StateGuard.RequireOptionalBoolean(obj, "turnPowerUsed", details);

        if (obj.TryGetProperty("picksConfirmed", out var picksConfirmed)
            && picksConfirmed.ValueKind is not (JsonValueKind.True or JsonValueKind.False))
            details.Add("picksConfirmed: expected boolean");

        OptionalRevealedAnswer(obj, details);
    }, UpgradeVeDich);

    private static void ValidatePowerSet(JsonElement powers, List<string> details, string path)
    {
        if (powers.ValueKind != JsonValueKind.Object)
        {
            details.Add($"{path}.powers: expected object");
            return;
        }
        StateGuard.RequireArray(powers, "available", details, path);
        StateGuard.RequireBoolean(powers, "usedThisTurn", details, path);

        if (!powers.TryGetProperty("staged", out var staged) || staged.ValueKind == JsonValueKind.Null)
            return;
        if (staged.ValueKind != JsonValueKind.Object)
        {
            details.Add($"{path}.powers.staged: expected object or null");
            return;
        }
        StateGuard.RequireOneOf(staged, "power", ["STAR", "ASSIGN"], details, $"{path}.powers.staged");
        if (staged.TryGetProperty("targetId", out var targetId)
            && targetId.ValueKind != JsonValueKind.Null
            && targetId.ValueKind != JsonValueKind.String)
            details.Add($"{path}.powers.staged.targetId: expected string or null");
    }

    private static VeDichState UpgradeVeDich(JsonElement raw, VeDichState state)
    {
        var next = state;
        if (raw.TryGetProperty("open", out var open)
            && open.ValueKind == JsonValueKind.Object
            && next.Open is not null
            && !open.TryGetProperty("window", out _))
        {
            next = next with { Open = UpgradeOpen(raw, open, next) };
        }
        return next with { Players = UpgradeVeDichPlayers(raw, next.Players) };
    }

    private static OpenQuestion UpgradeOpen(JsonElement raw, JsonElement open, VeDichState state)
    {
        var current = state.Open!;
        var answerer = open.GetProperty("answerer").GetString()!;
        var step = open.GetProperty("step").GetString()!;
        var powerText = open.TryGetProperty("power", out var powerItem) && powerItem.ValueKind == JsonValueKind.String
            ? powerItem.GetString()
            : null;
        var power = powerText is null ? (PowerKind?)null : Enum.Parse<PowerKind>(powerText);

        AnswerWindow window;
        if (step == "buzz")
        {
            var seconds = power == PowerKind.ASSIGN
                ? RoundRules.VeDichClockSeconds(state.Rules, current.Question.Value) ?? state.Rules.BuzzWindowS
                : state.Rules.BuzzWindowS;
            var partner = open.TryGetProperty("assignedTo", out var assignedTo)
                && assignedTo.ValueKind == JsonValueKind.String
                ? assignedTo.GetString()
                : null;
            window = partner is null
                ? AnswerWindow.BuzzOthers(seconds, answerer)
                : AnswerWindow.BuzzPair(answerer, partner, seconds);

            if (raw.TryGetProperty("buzzOpenedAt", out var opened)
                && opened.ValueKind == JsonValueKind.String)
                window = window.OpenFor(opened.GetString()!, seconds);
        }
        else
        {
            window = AnswerWindow.OralCurrentTurn(answerer);
            if (open.TryGetProperty("openedAt", out var openedAt)
                && openedAt.ValueKind == JsonValueKind.String)
            {
                var clock = RoundRules.VeDichClockSeconds(state.Rules, current.Question.Value);
                window = clock is null
                    ? window.Open(openedAt.GetString()!)
                    : window.OpenFor(openedAt.GetString()!, clock.Value);
            }
        }

        if (open.TryGetProperty("buzzer", out var buzzer) && buzzer.ValueKind == JsonValueKind.String)
            window = window with { Buzzer = buzzer.GetString() };
        if (open.TryGetProperty("buzzerMs", out var buzzerMs) && buzzerMs.ValueKind == JsonValueKind.Number)
            window = window with { BuzzerMs = buzzerMs.GetInt32() };

        if (raw.TryGetProperty("buzzLocked", out var locked)
            && locked.ValueKind == JsonValueKind.True
            && window.HasStarted)
        {
            window = window.Lock();
        }
        return current with { Window = window };
    }

    private static List<VeDichPlayerState> UpgradeVeDichPlayers(
        JsonElement raw, List<VeDichPlayerState> players)
    {
        if (!raw.TryGetProperty("players", out var arr) || arr.ValueKind != JsonValueKind.Array)
            return players;

        var upgraded = new List<VeDichPlayerState>();
        var turnIndex = raw.TryGetProperty("turnIndex", out var turn)
            && turn.ValueKind == JsonValueKind.Number
            ? turn.GetInt32()
            : -1;
        var index = 0;
        foreach (var p in arr.EnumerateArray())
        {
            var player = players[index];
            if (!p.TryGetProperty("powers", out _))
                player = player with { Powers = PowersFrom(p, raw, index == turnIndex) };
            upgraded.Add(player);
            index++;
        }
        return upgraded;
    }

    private static PowerSet PowersFrom(JsonElement player, JsonElement root, bool isTurnPlayer)
    {
        var available = player.GetProperty("powersLeft").EnumerateArray()
            .Select(x => Enum.Parse<PowerKind>(x.GetString()!))
            .ToList();
        if (!isTurnPlayer) return new PowerSet { Available = available };

        var used = root.TryGetProperty("turnPowerUsed", out var flag)
            && flag.ValueKind == JsonValueKind.True;

        StagedPower? staged = null;
        if (root.TryGetProperty("stagedPower", out var s) && s.ValueKind == JsonValueKind.Object)
        {
            var target = s.TryGetProperty("targetId", out var t) && t.ValueKind == JsonValueKind.String
                ? t.GetString()
                : null;
            staged = new StagedPower
            {
                Power = Enum.Parse<PowerKind>(s.GetProperty("power").GetString()!),
                TargetId = target
            };
        }
        return new PowerSet { Available = available, UsedThisTurn = used, Staged = staged };
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
