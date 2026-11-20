using System.Text.Json.Serialization;

using AOC.Domain.Contracts;
namespace AOC.Domain.Gameplay.Turns;

public sealed record TieBreakState
{
    [JsonPropertyName("rules")] public TieBreakRules Rules { get; init; } = new();

    [JsonPropertyName("ended")] public bool Ended { get; init; }
    [JsonPropertyName("players")] public List<string> Players { get; init; } = [];
    [JsonPropertyName("eliminated")] public List<string> Eliminated { get; init; } = [];
    [JsonPropertyName("correct")] public Dictionary<string, int> Correct { get; init; } = [];
    [JsonPropertyName("questionIds")] public List<string> QuestionIds { get; init; } = [];
    [JsonPropertyName("cursor")] public int Cursor { get; init; }

    [JsonPropertyName("window")] public AnswerWindow Window { get; init; } = new();
}

public sealed record TieBreakRules(int PointsPerCorrect = 10, int BuzzWindowS = 5, bool ReopenBuzzOnWrong = true);

public sealed record RankedEntry(string UserId, int TotalScore);

public static class TieBreakTurn
{
    private static RuleError Err(string code, string message) => new(code, message);

    private static AnswerWindow FreshWindow(TieBreakRules rules) => new()
    {
        Mode = AnswerMode.Buzz,
        Eligibility = AnswerEligibility.Everyone,
        Seconds = rules.BuzzWindowS
    };

    public static TieBreakState StartTieBreak(
        IReadOnlyList<string> playerIds,
        IReadOnlyList<string> questionIds,
        TieBreakRules? rules = null)
    {
        rules ??= new TieBreakRules();
        if (playerIds.Count < 2) throw Err("VALIDATION", "tie-break needs at least two tied players");
        if (playerIds.Distinct().Count() != playerIds.Count)
            throw Err("VALIDATION", "tie-break players must be distinct");
        if (questionIds.Count == 0) throw Err("VALIDATION", "tie-break has no questions");

        return new TieBreakState
        {
            Rules = rules,
            Players = [.. playerIds],
            Correct = playerIds.ToDictionary(id => id, _ => 0),
            QuestionIds = [.. questionIds],
            Window = FreshWindow(rules)
        };
    }

    public static string? CurrentQuestionId(TieBreakState state)
    {
        if (state.Ended) return null;
        if (state.Cursor >= state.QuestionIds.Count) return null;
        return state.QuestionIds[state.Cursor];
    }

    public static List<string> ActivePlayers(TieBreakState state)
        => state.Players.Where(p => !state.Eliminated.Contains(p)).ToList();

    public static TieBreakState OpenBuzz(TieBreakState state, string nowIso)
    {
        if (state.Ended) throw Err("ENDED", "the tie-break has ended");
        if (CurrentQuestionId(state) is null) throw Err("NO_QUESTION", "no tie-break question in play");
        if (state.Window.HasStarted) throw Err("ALREADY_OPEN", "the buzz window is already open");
        if (ActivePlayers(state).Count < 2) throw Err("DECIDED", "fewer than two players are still in");

        return state with { Window = state.Window.OpenFor(nowIso, state.Rules.BuzzWindowS) };
    }

    public static TieBreakState Buzz(TieBreakState state, string playerId, string nowIso)
    {
        if (state.Ended) throw Err("ENDED", "the tie-break has ended");
        if (!state.Players.Contains(playerId)) throw Err("NOT_A_TIED_PLAYER", $"{playerId} is not in this tie-break");
        if (state.Eliminated.Contains(playerId)) throw Err("ELIMINATED", $"{playerId} left the tie-break");

        return state with { Window = state.Window.Buzz(playerId, nowIso) };
    }

    public static TieBreakState LockBuzz(TieBreakState state)
    {
        if (state.Ended) throw Err("ENDED", "the tie-break has ended");
        return state with { Window = state.Window.Lock() };
    }

    public static TieBreakState Judge(TieBreakState state, bool correct)
    {
        if (state.Ended) throw Err("ENDED", "the tie-break has ended");
        var buzzer = state.Window.Buzzer ?? throw Err("NO_BUZZER", "nobody buzzed on this question");

        if (correct)
        {
            var scores = new Dictionary<string, int>(state.Correct);
            scores[buzzer] = scores.GetValueOrDefault(buzzer) + state.Rules.PointsPerCorrect;
            return Advance(state with { Correct = scores });
        }

        var eliminated = new List<string>(state.Eliminated) { buzzer };
        var stayed = state with { Eliminated = eliminated, Window = FreshWindow(state.Rules) };

        if (ActivePlayers(stayed).Count < 2)
            return stayed with { Ended = true };

        if (!state.Rules.ReopenBuzzOnWrong)
            return Advance(stayed);

        return stayed;
    }

    public static TieBreakState Advance(TieBreakState state)
    {
        if (state.Ended) throw Err("ENDED", "the tie-break has ended");
        var next = state with
        {
            Cursor = state.Cursor + 1,
            Window = FreshWindow(state.Rules)
        };
        if (next.Cursor >= next.QuestionIds.Count) return next with { Ended = true };
        return next;
    }

    public static TieBreakState EndTieBreak(TieBreakState state)
    {
        if (state.Ended) return state;
        return state with { Ended = true, Window = FreshWindow(state.Rules) };
    }

    public static int TieBreakScore(TieBreakState state, string playerId)
        => state.Correct.GetValueOrDefault(playerId);

    public static Dictionary<string, int> RankWithTieBreak(
        IReadOnlyList<RankedEntry> entries,
        IReadOnlyDictionary<string, int>? tieBreak)
    {
        int Key(RankedEntry e) => tieBreak is not null && tieBreak.TryGetValue(e.UserId, out var v) ? v : 0;

        var sorted = entries
            .OrderByDescending(e => e.TotalScore)
            .ThenByDescending(Key)
            .ToList();

        var ranks = new Dictionary<string, int>();
        var rank = 0;
        (int Total, int Tie)? last = null;
        foreach (var entry in sorted)
        {
            var composite = (Total: entry.TotalScore, Tie: Key(entry));
            if (last is null || composite.Total != last.Value.Total || composite.Tie != last.Value.Tie)
            {
                rank += 1;
                last = composite;
            }
            ranks[entry.UserId] = rank;
        }
        return ranks;
    }
}
