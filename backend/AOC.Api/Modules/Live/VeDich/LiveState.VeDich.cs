using System.Text.Json;
using AOC.Api.Http;
using AOC.Domain.Contracts;
using AOC.Domain.Gameplay;
using AOC.Infrastructure.Data;
using AOC.Domain.Gameplay.Turns;

namespace AOC.Api.Modules.Live;

public static partial class LiveState
{
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
                ValidateWindow(window, details, "open.window");
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

    private static void ValidateWindow(JsonElement window, List<string> details, string path)
    {
        if (window.ValueKind != JsonValueKind.Object)
        {
            details.Add($"{path}: expected object");
            return;
        }

        StateGuard.RequireOneOf(window, "mode", ["Oral", "Buzz", "Typed"], details, path);
        StateGuard.RequireOneOf(window, "eligibility", ["Everyone", "CurrentTurn", "Others", "Pair"], details, path);
        StateGuard.RequireOptionalString(window, "openedAt", details, path);
        StateGuard.RequireOptionalString(window, "closesAt", details, path);

        var mode = window.TryGetProperty("mode", out var m) && m.ValueKind == JsonValueKind.String
            ? m.GetString()
            : null;
        if (mode != "Buzz") return;

        StateGuard.RequireInteger(window, "seconds", details, path);
        var eligibility = window.TryGetProperty("eligibility", out var e) && e.ValueKind == JsonValueKind.String
            ? e.GetString()
            : null;
        if (eligibility == "Pair")
        {
            StateGuard.RequireString(window, "pairA", details, path);
            StateGuard.RequireString(window, "pairB", details, path);
        }
    }

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
            if (index >= players.Count)
                throw new LiveStateError("stored live state failed validation",
                    [$"players[{index}]: the state holds fewer players than the jsonb array"]);
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
}
