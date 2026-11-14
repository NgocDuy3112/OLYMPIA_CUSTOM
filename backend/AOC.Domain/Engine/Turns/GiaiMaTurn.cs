using System.Text.Json.Serialization;
using AOC.Domain.Engine.Scoring;

namespace AOC.Domain.Engine.Turns;

/// <summary>Port of turns/giai-ma.ts — hint windows and keyword locking.</summary>
public sealed record GiaiMaPlayer
{
    [JsonPropertyName("id")] public required string Id { get; init; }
    [JsonPropertyName("hintsRevealed")] public int HintsRevealed { get; init; }
    [JsonPropertyName("revealed")] public List<string> Revealed { get; init; } = [];
    [JsonPropertyName("keywordLocked")] public bool KeywordLocked { get; init; }
    [JsonPropertyName("keywordPoints")] public int KeywordPoints { get; init; }
    [JsonPropertyName("eliminated")] public bool Eliminated { get; init; }
}

public sealed record GiaiMaState
{
    [JsonPropertyName("rules")] public RoundRules.GiaiMaRules Rules { get; init; } = RoundRules.DefaultGiaiMa();
    [JsonPropertyName("stage")] public string Stage { get; init; } = "hints"; // hints | ended
    [JsonPropertyName("players")] public List<GiaiMaPlayer> Players { get; init; } = [];
    [JsonPropertyName("hintIds")] public List<string> HintIds { get; init; } = [];
    [JsonPropertyName("picked")] public List<string> Picked { get; init; } = [];
    [JsonPropertyName("openHint")] public string? OpenHint { get; init; }
    [JsonPropertyName("openHintAt")] public string? OpenHintAt { get; init; }

    [JsonPropertyName("revealedAnswer")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? RevealedAnswer { get; init; }
}

public static class GiaiMaTurn
{
    private static RuleError Err(string code, string message) => new(code, message);

    public static GiaiMaState StartGiaiMa(
        IEnumerable<string> playerIds,
        IEnumerable<string> hintIds,
        RoundRules.GiaiMaRules? rules = null)
    {
        rules ??= RoundRules.DefaultGiaiMa();
        return new GiaiMaState
        {
            Rules = rules,
            Players = playerIds.Select(id => new GiaiMaPlayer { Id = id }).ToList(),
            HintIds = [.. hintIds]
        };
    }

    public static List<string> RemainingHints(GiaiMaState state)
    {
        var picked = state.Picked.ToHashSet();
        return state.HintIds.Where(id => !picked.Contains(id)).ToList();
    }

    private static GiaiMaScoring.KeywordRules KeywordRulesOf(GiaiMaState state)
        => new(state.Rules.Start, state.Rules.DropPerHint, state.Rules.Floor);

    public static int KeywordValueFor(GiaiMaState state, string playerId)
    {
        var player = state.Players.FirstOrDefault(p => p.Id == playerId)
            ?? throw Err("UNKNOWN_PLAYER", $"player {playerId} is not in giai-ma");
        return GiaiMaScoring.KeywordValue(player.HintsRevealed, KeywordRulesOf(state));
    }

    public static GiaiMaState OpenHint(GiaiMaState state, string hintId, string openedAt)
    {
        if (state.Stage != "hints") throw Err("WRONG_STAGE", "hints are over");
        if (state.OpenHint is not null) throw Err("WINDOW_OPEN", $"hint {state.OpenHint} is already open");
        if (!RemainingHints(state).Contains(hintId))
            throw Err("HINT_CONSUMED", $"hint {hintId} is not available");
        return state with { OpenHint = hintId, OpenHintAt = openedAt };
    }

    public static bool IsWindowOpen(GiaiMaState state, string nowIso)
    {
        if (state.OpenHint is null || state.OpenHintAt is null) return false;
        var elapsed = DateTimeOffset.Parse(nowIso).ToUnixTimeMilliseconds()
            - DateTimeOffset.Parse(state.OpenHintAt).ToUnixTimeMilliseconds();
        return elapsed >= 0 && elapsed <= state.Rules.HintWindowS * 1000;
    }

    public static bool CanPlayerAnswer(GiaiMaState state, string playerId, string nowIso)
    {
        if (!IsWindowOpen(state, nowIso)) return false;
        var player = state.Players.FirstOrDefault(p => p.Id == playerId);
        return player is not null && !player.KeywordLocked && !player.Eliminated;
    }

    public static GiaiMaState CloseHintWindow(GiaiMaState state)
    {
        if (state.OpenHint is null) throw Err("NO_OPEN_HINT", "no hint window is open");
        return state with { OpenHint = null, OpenHintAt = null };
    }

    public static GiaiMaState ResolveOpenHint(GiaiMaState state, IReadOnlyDictionary<string, bool> answers)
    {
        if (state.Stage != "hints") throw Err("WRONG_STAGE", "hints are over");
        if (state.OpenHint is null) throw Err("NO_OPEN_HINT", "no hint window is open");

        var hint = state.OpenHint;
        var players = state.Players.Select(p =>
        {
            if (p.KeywordLocked || !answers.GetValueOrDefault(p.Id)) return p;
            return p with
            {
                HintsRevealed = p.HintsRevealed + 1,
                Revealed = [.. p.Revealed, hint]
            };
        }).ToList();

        var picked = new List<string>(state.Picked) { hint };
        var next = state with { Players = players, Picked = picked, OpenHint = null, OpenHintAt = null };
        return RemainingHints(next).Count == 0 ? next with { Stage = "ended" } : next;
    }

    public static GiaiMaState LockKeyword(GiaiMaState state, string playerId)
    {
        if (state.Stage != "hints") throw Err("WRONG_STAGE", "giai-ma is over");
        var player = state.Players.FirstOrDefault(p => p.Id == playerId)
            ?? throw Err("UNKNOWN_PLAYER", $"player {playerId} is not in giai-ma");
        if (player.KeywordLocked) throw Err("ALREADY_SUBMITTED", "this player already submitted a keyword");

        var players = state.Players.Select(p =>
            p.Id == playerId ? p with { KeywordLocked = true } : p).ToList();
        return state with { Players = players };
    }

    public static GiaiMaState JudgeKeyword(GiaiMaState state, string playerId, bool correct)
    {
        var player = state.Players.FirstOrDefault(p => p.Id == playerId)
            ?? throw Err("UNKNOWN_PLAYER", $"player {playerId} is not in giai-ma");
        if (!player.KeywordLocked) throw Err("NOT_SUBMITTED", $"player {playerId} has not submitted a keyword");

        var players = state.Players.Select(p =>
            p.Id == playerId
                ? p with
                {
                    KeywordPoints = correct
                        ? GiaiMaScoring.KeywordValue(p.HintsRevealed, KeywordRulesOf(state))
                        : 0,
                    Eliminated = !correct
                }
                : p).ToList();
        return state with { Players = players };
    }

    public static int GiaiMaPoints(GiaiMaState state, string playerId)
        => state.Players.FirstOrDefault(p => p.Id == playerId)?.KeywordPoints ?? 0;

    public static GiaiMaState EndGiaiMa(GiaiMaState state)
        => state.Stage == "ended" ? state : state with { Stage = "ended" };
}
