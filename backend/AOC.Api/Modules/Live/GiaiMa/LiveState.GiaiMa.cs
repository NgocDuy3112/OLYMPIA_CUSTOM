using System.Text.Json;
using AOC.Api.Http;
using AOC.Domain.Contracts;
using AOC.Domain.Gameplay;
using AOC.Infrastructure.Data;
using AOC.Domain.Gameplay.Turns;

namespace AOC.Api.Modules.Live;

public static partial class LiveState
{
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
}
