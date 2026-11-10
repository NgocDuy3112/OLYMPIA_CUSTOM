using System.Text.Json.Serialization;
using Olympia.Domain.Engine.Scoring;

namespace Olympia.Domain.Engine.Turns;

/// <summary>Port of turns/khoi-dong.ts — phase 1 (per-player oral set) and phase 2 (chung).</summary>
public sealed record Phase1State
{
    [JsonPropertyName("kind")] public string Kind { get; init; } = "phase1";
    [JsonPropertyName("budgetS")] public int BudgetS { get; init; }
    [JsonPropertyName("pointsPerCorrect")] public int PointsPerCorrect { get; init; }
    [JsonPropertyName("questionIds")] public List<string> QuestionIds { get; init; } = [];
    [JsonPropertyName("cursor")] public int Cursor { get; init; }
    [JsonPropertyName("elapsedS")] public double ElapsedS { get; init; }
    [JsonPropertyName("results")] public Dictionary<string, Phase1Result> Results { get; init; } = new();
    [JsonPropertyName("ended")] public bool Ended { get; init; }
}

public sealed record Phase1Result(
    [property: JsonPropertyName("correct")] bool Correct,
    [property: JsonPropertyName("points")] int Points
);

public sealed record Phase2State
{
    [JsonPropertyName("kind")] public string Kind { get; init; } = "phase2";
    [JsonPropertyName("pointsPerCorrect")] public int PointsPerCorrect { get; init; }
    [JsonPropertyName("windowS")] public int WindowS { get; init; }
    [JsonPropertyName("questionIds")] public List<string> QuestionIds { get; init; } = [];
    [JsonPropertyName("index")] public int Index { get; init; }
    [JsonPropertyName("openedAt")] public string? OpenedAt { get; init; }
    [JsonPropertyName("results")] public Dictionary<string, Dictionary<string, int>> Results { get; init; } = new();
    [JsonPropertyName("closed")] public bool Closed { get; init; }
}

public static class KhoiDongTurn
{
    private static void Fail(string code, string message) => throw new RuleError(code, message);

    public static Phase1State StartPhase1(IEnumerable<string> questionIds, RoundRules.KhoiDongRules rules)
    {
        var ids = questionIds.ToList();
        if (ids.Count != rules.Phase1Questions)
            Fail("VALIDATION", $"phase 1 needs exactly {rules.Phase1Questions} questions");
        return new Phase1State
        {
            QuestionIds = ids,
            BudgetS = rules.Phase1BudgetS,
            PointsPerCorrect = rules.PointsPerCorrect
        };
    }

    public static Phase1State AnswerPhase1(Phase1State state, bool correct, double spentS)
    {
        if (state.Ended) Fail("PHASE_ENDED", "phase 1 is over");
        var elapsedS = state.ElapsedS + spentS;
        var id = state.QuestionIds[state.Cursor];

        if (elapsedS > state.BudgetS)
            return state with { ElapsedS = state.BudgetS, Ended = true };

        var cursor = state.Cursor + 1;
        var results = new Dictionary<string, Phase1Result>(state.Results)
        {
            [id] = new Phase1Result(correct, KhoiDongScoring.Points(correct, state.PointsPerCorrect))
        };
        return state with
        {
            ElapsedS = elapsedS,
            Cursor = cursor,
            Results = results,
            Ended = cursor >= state.QuestionIds.Count
        };
    }

    public static Phase1State TimeOutPhase1(Phase1State state)
        => state.Ended ? state : state with { ElapsedS = state.BudgetS, Ended = true };

    public static int Phase1Total(Phase1State state)
        => state.Results.Values.Sum(r => r.Points);

    public static Phase2State StartPhase2(IEnumerable<string> questionIds, RoundRules.KhoiDongRules rules)
    {
        var ids = questionIds.ToList();
        if (ids.Count != rules.Phase2Questions)
            Fail("VALIDATION", $"chung needs exactly {rules.Phase2Questions} questions");
        return new Phase2State
        {
            PointsPerCorrect = rules.PointsPerCorrect,
            WindowS = rules.Phase2WindowS,
            QuestionIds = ids
        };
    }

    public static string? Phase2QuestionId(Phase2State state)
        => state.Closed || state.Index >= state.QuestionIds.Count ? null : state.QuestionIds[state.Index];

    public static bool Phase2Complete(Phase2State state)
        => state.Closed || state.Index >= state.QuestionIds.Count;

    public static bool IsPhase2WindowOpen(Phase2State state, string nowIso)
    {
        if (state.OpenedAt is null || Phase2QuestionId(state) is null) return false;
        var elapsed = DateTimeOffset.Parse(nowIso).ToUnixTimeMilliseconds()
            - DateTimeOffset.Parse(state.OpenedAt).ToUnixTimeMilliseconds();
        return elapsed >= 0 && elapsed <= state.WindowS * 1000;
    }

    public static Phase2State OpenPhase2Window(Phase2State state, string nowIso)
    {
        if (state.Closed) Fail("PHASE_ENDED", "chung is over");
        if (Phase2QuestionId(state) is null) Fail("PHASE_ENDED", "every question has been played");
        if (IsPhase2WindowOpen(state, nowIso)) Fail("ALREADY_OPEN", "the window is already running");
        return state with { OpenedAt = nowIso };
    }

    public static Phase2State JudgePhase2Card(Phase2State state, string playerId, bool correct)
    {
        var questionId = Phase2QuestionId(state);
        if (questionId is null) Fail("PHASE_ENDED", "chung is over");

        var results = new Dictionary<string, Dictionary<string, int>>(state.Results);
        var byPlayer = results.TryGetValue(questionId, out var existing)
            ? new Dictionary<string, int>(existing)
            : new Dictionary<string, int>();
        byPlayer[playerId] = correct ? state.PointsPerCorrect : 0;
        results[questionId] = byPlayer;
        return state with { Results = results };
    }

    public static Phase2State NextPhase2(Phase2State state)
    {
        if (state.Closed) Fail("PHASE_ENDED", "chung is over");
        if (Phase2QuestionId(state) is null) Fail("PHASE_ENDED", "every question has been played");

        var index = state.Index + 1;
        return state with { Index = index, OpenedAt = null, Closed = index >= state.QuestionIds.Count };
    }

    public static Phase2State ClosePhase2(Phase2State state) => state with { Closed = true };

    public static int Phase2Points(Phase2State state, string playerId)
        => state.Results.Values.Sum(byPlayer => byPlayer.GetValueOrDefault(playerId));
}
