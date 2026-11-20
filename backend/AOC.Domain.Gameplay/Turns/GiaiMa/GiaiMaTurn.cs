using AOC.Domain.Contracts;
using AOC.Domain.Gameplay.Scoring;

namespace AOC.Domain.Gameplay.Turns;

public static class GiaiMaTurn
{
    private static RuleError Err(string code, string message) => new(code, message);

    public static GiaiMaState StartGiaiMa(
        IEnumerable<string> playerIds,
        IEnumerable<string> hintIds,
        RoundRules.GiaiMaRules? rules = null)
    {
        rules ??= RuleBatches.GiaiMa;
        return new GiaiMaState
        {
            Rules = rules,
            Players = playerIds.Select(id => new GiaiMaPlayer { Id = id }).ToList(),
            HintIds = [.. hintIds],
            HintWindow = AnswerWindow.TypedEveryone(rules.HintWindowS)
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

    public static GiaiMaState LockOpenHint(GiaiMaState state, IReadOnlyDictionary<string, bool> answers)
    {
        if (state.OpenHint is null) throw Err("NO_OPEN_HINT", "no hint is open to lock");
        return ResolveOpenHint(state, answers);
    }

    public static GiaiMaState PickHint(GiaiMaState state, string hintId)
    {
        if (state.Step != "hints") throw Err("WRONG_STAGE", "hints are over");
        if (state.OpenHint is not null) throw Err("WINDOW_OPEN", $"hint {state.OpenHint} is already open");
        if (!RemainingHints(state).Contains(hintId))
            throw Err("HINT_CONSUMED", $"hint {hintId} is not available");
        return state with { OpenHint = hintId, HintWindow = FreshHintWindow(state) };
    }

    public static GiaiMaState StartWindow(GiaiMaState state, string nowIso)
    {
        if (state.Step != "hints") throw Err("WRONG_STAGE", "hints are over");
        if (state.OpenHint is null)
            throw Err("NO_OPEN_HINT", "no hint is open — pick a hint first");
        if (state.HintWindow.IsOpen(nowIso))
            throw Err("WINDOW_OPEN", "the answer window is already running");
        if (KeywordWindowRunning(state, nowIso))
            throw Err("WINDOW_OPEN", "the keyword countdown is running");
        return state with
        {
            HintWindow = FreshHintWindow(state).OpenFor(nowIso, state.Rules.HintWindowS)
        };
    }

    public static bool KeywordWindowRunning(GiaiMaState state, string nowIso)
    {
        if (state.KeywordClosesAt is null) return false;
        return DateTimeOffset.Parse(nowIso) <= DateTimeOffset.Parse(state.KeywordClosesAt);
    }

    public static bool KeywordWindowOpen(GiaiMaState state, string nowIso)
    {
        if (state.KeywordClosesAt is null) return true;
        return KeywordWindowRunning(state, nowIso);
    }

    public static GiaiMaState StartKeywordCountdown(GiaiMaState state, string nowIso)
    {
        if (state.Step != "hints") throw Err("WRONG_STAGE", "hints are over");
        if (state.KeywordClosesAt is not null)
            throw Err("WINDOW_OPEN", "the keyword countdown has already run");
        return state with
        {
            KeywordClosesAt = DateTimeOffset.Parse(nowIso)
                .AddSeconds(state.Rules.HintWindowS)
                .UtcDateTime.ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
        };
    }

    public static bool IsWindowOpen(GiaiMaState state, string nowIso)
    {
        if (!state.HintWindow.IsOpen(nowIso)) return false;
        if (KeywordWindowRunning(state, nowIso)) return false;
        return true;
    }

    public static bool CanPlayerAnswer(GiaiMaState state, string playerId, string nowIso)
    {
        if (!IsWindowOpen(state, nowIso)) return false;
        var player = state.Players.FirstOrDefault(p => p.Id == playerId);
        if (player is null) return false;
        if (player.KeywordLocked) return false;
        if (player.Eliminated) return false;
        return true;
    }

    public static GiaiMaState CloseHintWindow(GiaiMaState state)
    {
        if (state.OpenHint is null) throw Err("NO_OPEN_HINT", "no hint window is open");
        return state with { OpenHint = null, HintWindow = FreshHintWindow(state) };
    }

    public static GiaiMaState ResolveOpenHint(GiaiMaState state, IReadOnlyDictionary<string, bool> answers)
    {
        if (state.Step != "hints") throw Err("WRONG_STAGE", "hints are over");
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
        var next = state with { Players = players, Picked = picked, OpenHint = null, HintWindow = FreshHintWindow(state) };
        return RemainingHints(next).Count == 0 ? next with { Step = "ended" } : next;
    }

    public static GiaiMaState LockKeyword(GiaiMaState state, string playerId)
    {
        if (state.Step != "hints") throw Err("WRONG_STAGE", "giai-ma is over");
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
        => state.Step == "ended" ? state : state with { Step = "ended" };

    private static AnswerWindow FreshHintWindow(GiaiMaState state)
        => AnswerWindow.TypedEveryone(state.Rules.HintWindowS);
}
