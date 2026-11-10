using System.Text.Json.Serialization;

namespace Olympia.Domain.Engine.Turns;

/// <summary>Port of turns/tie-break.ts — sudden-death tie-breaks and composite ranking.</summary>
public sealed record TieBreakAnswer
{
    [JsonPropertyName("text")] public required string Text { get; init; }

    [JsonPropertyName("correct")] public bool? Correct { get; init; } // null = unjudged
}

public sealed record TieBreakState
{
    [JsonPropertyName("rules")] public TieBreakRules Rules { get; init; } = new();
    [JsonPropertyName("ended")] public bool Ended { get; init; }
    [JsonPropertyName("players")] public List<string> Players { get; init; } = [];
    [JsonPropertyName("questionIds")] public List<string> QuestionIds { get; init; } = [];
    [JsonPropertyName("cursor")] public int Cursor { get; init; }
    [JsonPropertyName("open")] public bool Open { get; init; }

    /// <summary>playerId → questionId → answer.</summary>
    [JsonPropertyName("answers")]
    public Dictionary<string, Dictionary<string, TieBreakAnswer>> Answers { get; init; } = new();
}

public sealed record TieBreakRules(int PointsPerCorrect = 10);

public sealed record RankedEntry(string UserId, int TotalScore);

public static class TieBreakTurn
{
    private static RuleError Err(string code, string message) => new(code, message);

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

        var answers = playerIds.ToDictionary(id => id, _ => new Dictionary<string, TieBreakAnswer>());
        return new TieBreakState
        {
            Rules = rules,
            Players = [.. playerIds],
            QuestionIds = [.. questionIds],
            Answers = answers
        };
    }

    public static string? CurrentQuestionId(TieBreakState state)
    {
        if (state.Ended) return null;
        if (state.Cursor >= state.QuestionIds.Count) return null;
        return state.QuestionIds[state.Cursor];
    }

    private static string RequireOpen(TieBreakState state)
    {
        if (state.Ended) throw Err("ENDED", "the tie-break has ended");
        var id = CurrentQuestionId(state);
        if (id is null) throw Err("NO_QUESTION", "no tie-break question in play");
        if (!state.Open) throw Err("WINDOW_CLOSED", "the tie-break answer window is not open");
        return id;
    }

    public static TieBreakState OpenWindow(TieBreakState state)
    {
        if (state.Ended) throw Err("ENDED", "the tie-break has ended");
        if (CurrentQuestionId(state) is null) throw Err("NO_QUESTION", "no tie-break question in play");
        if (state.Open) return state;
        return state with { Open = true };
    }

    public static TieBreakState CloseWindow(TieBreakState state)
    {
        if (state.Ended) throw Err("ENDED", "the tie-break has ended");
        if (!state.Open) return state;
        return state with { Open = false };
    }

    public static TieBreakState Submit(TieBreakState state, string playerId, string text)
    {
        var id = RequireOpen(state);
        if (!state.Players.Contains(playerId))
            throw Err("NOT_A_TIED_PLAYER", $"{playerId} is not in this tie-break");

        var answers = new Dictionary<string, Dictionary<string, TieBreakAnswer>>(state.Answers);
        var mine = answers.TryGetValue(playerId, out var map)
            ? new Dictionary<string, TieBreakAnswer>(map)
            : new Dictionary<string, TieBreakAnswer>();
        mine[id] = new TieBreakAnswer { Text = text, Correct = null };
        answers[playerId] = mine;
        return state with { Answers = answers };
    }

    public static TieBreakState Finalize(TieBreakState state, IReadOnlyList<(string PlayerId, bool Correct)> verdicts)
    {
        if (state.Ended) throw Err("ENDED", "the tie-break has ended");
        var questionId = CurrentQuestionId(state);
        if (questionId is null) throw Err("NO_QUESTION", "no tie-break question in play");
        if (!state.Open) throw Err("WINDOW_CLOSED", "the tie-break answer window is not open");

        var closed = CloseWindow(state);
        var answers = new Dictionary<string, Dictionary<string, TieBreakAnswer>>(closed.Answers);
        foreach (var (playerId, correct) in verdicts)
        {
            if (!closed.Players.Contains(playerId))
                throw Err("NOT_A_TIED_PLAYER", $"{playerId} is not in this tie-break");
            var mine = answers.TryGetValue(playerId, out var map)
                ? new Dictionary<string, TieBreakAnswer>(map)
                : new Dictionary<string, TieBreakAnswer>();
            var prior = mine.GetValueOrDefault(questionId) ?? new TieBreakAnswer { Text = "", Correct = null };
            mine[questionId] = prior with { Correct = correct };
            answers[playerId] = mine;
        }
        return closed with { Answers = answers };
    }

    public static TieBreakState NextQuestion(TieBreakState state)
    {
        if (state.Ended) throw Err("ENDED", "the tie-break has ended");
        if (state.Cursor + 1 >= state.QuestionIds.Count)
            throw Err("NO_MORE_QUESTIONS", "no more tie-break questions");
        var current = CurrentQuestionId(state) ?? "";
        var judged = state.Players.All(p =>
            state.Answers.TryGetValue(p, out var mine)
            && mine.TryGetValue(current, out var answer)
            && answer.Correct is not null);
        if (state.Open || !judged) throw Err("QUESTION_IN_PLAY", "judge the current question first");
        return state with { Cursor = state.Cursor + 1, Open = false };
    }

    public static TieBreakState EndTieBreak(TieBreakState state)
    {
        if (state.Ended) return state;
        if (state.Open) throw Err("WINDOW_OPEN", "close the answer window first");
        var allJudged = state.QuestionIds.All(qid =>
            state.Players.All(p =>
                state.Answers.TryGetValue(p, out var mine)
                && mine.TryGetValue(qid, out var answer)
                && answer.Correct is not null));
        if (!allJudged) throw Err("QUESTIONS_UNJUDGED", "every tie-break question needs its verdicts");
        return state with { Ended = true };
    }

    public static int TieBreakScore(TieBreakState state, string playerId)
    {
        if (!state.Answers.TryGetValue(playerId, out var mine)) return 0;
        return mine.Values.Count(a => a.Correct == true) * state.Rules.PointsPerCorrect;
    }

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
