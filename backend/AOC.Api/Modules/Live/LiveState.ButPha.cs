using System.Text.Json;
using AOC.Api.Http;
using AOC.Domain.Contracts;
using AOC.Domain.Gameplay;
using AOC.Infrastructure.Data;
using AOC.Domain.Gameplay.Turns;

namespace AOC.Api.Modules.Live;

public static partial class LiveState
{
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
}
