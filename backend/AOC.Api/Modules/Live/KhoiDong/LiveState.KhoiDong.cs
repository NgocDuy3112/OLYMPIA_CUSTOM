using System.Text.Json;
using AOC.Api.Http;
using AOC.Domain.Contracts;
using AOC.Domain.Gameplay;
using AOC.Infrastructure.Data;
using AOC.Domain.Gameplay.Turns;

namespace AOC.Api.Modules.Live;

public static partial class LiveState
{
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
}
