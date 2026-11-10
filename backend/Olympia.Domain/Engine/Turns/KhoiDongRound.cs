using System.Text.Json.Serialization;

namespace Olympia.Domain.Engine.Turns;

/// <summary>Port of turns/khoi-dong-round.ts — the round-level state machine over phase 1/2.</summary>
public sealed record KhoiDongState
{
    [JsonPropertyName("rules")] public RoundRules.KhoiDongRules Rules { get; init; } = RoundRules.DefaultKhoiDong();
    [JsonPropertyName("stage")] public string Stage { get; init; } = "phase1"; // phase1 | phase2
    [JsonPropertyName("ended")] public bool Ended { get; init; }
    [JsonPropertyName("order")] public List<string> Order { get; init; } = [];
    [JsonPropertyName("activeIndex")] public int ActiveIndex { get; init; }
    [JsonPropertyName("runs")] public Dictionary<string, Phase1State> Runs { get; init; } = new();
    [JsonPropertyName("phase2")] public Phase2State? Phase2 { get; init; }

    [JsonPropertyName("revealedAnswer")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? RevealedAnswer { get; init; }
}

public static class KhoiDongRound
{
    private static void Fail(string code, string message) => throw new RuleError(code, message);

    public static KhoiDongState StartKhoiDong(
        IReadOnlyList<string> playerIds,
        IReadOnlyList<string> phase1Ids,
        RoundRules.KhoiDongRules? rules = null)
    {
        rules ??= RoundRules.DefaultKhoiDong();
        if (playerIds.Count == 0) Fail("VALIDATION", "khoi-dong needs at least one player");

        // Riêng is one set of questions PER PLAYER: sliced in seat order.
        var perPlayer = rules.Phase1Questions;
        var expected = perPlayer * playerIds.Count;
        if (phase1Ids.Count != expected)
            Fail("VALIDATION",
                $"phase 1 needs {expected} questions ({perPlayer} × {playerIds.Count} players), got {phase1Ids.Count}");

        var runs = new Dictionary<string, Phase1State>();
        for (var index = 0; index < playerIds.Count; index++)
            runs[playerIds[index]] = KhoiDongTurn.StartPhase1(
                phase1Ids.Skip(index * perPlayer).Take(perPlayer).ToList(), rules);

        return new KhoiDongState
        {
            Rules = rules,
            Order = [.. playerIds],
            Runs = runs
        };
    }

    public static string? ActivePlayerId(KhoiDongState state)
    {
        if (state.Stage != "phase1") return null;
        return state.ActiveIndex < state.Order.Count ? state.Order[state.ActiveIndex] : null;
    }

    public static string? ActiveQuestionId(KhoiDongState state)
    {
        if (state.Stage != "phase1") return null;
        var id = ActivePlayerId(state);
        if (id is null) return null;
        var run = state.Runs[id];
        if (run.Ended) return null;
        return run.Cursor < run.QuestionIds.Count ? run.QuestionIds[run.Cursor] : null;
    }

    public static bool Phase1Complete(KhoiDongState state)
        => state.Order.All(id => state.Runs[id].Ended);

    public static bool Phase1Untouched(KhoiDongState state)
        => state.Order.All(id => state.Runs[id].Results.Count == 0);

    private static KhoiDongState AdvanceActive(KhoiDongState state)
        => state with { ActiveIndex = Math.Min(state.ActiveIndex + 1, state.Order.Count - 1) };

    public static KhoiDongState RecordOral(KhoiDongState state, bool correct, double spentS)
    {
        if (state.Stage != "phase1") Fail("WRONG_STAGE", "phase 1 is over");
        var id = ActivePlayerId(state);
        if (id is null) Fail("NO_ACTIVE_PLAYER", "no player is answering");
        var run = state.Runs[id];
        if (run.Ended) Fail("RUN_ENDED", $"{id} has finished phase 1");

        var runs = new Dictionary<string, Phase1State>(state.Runs)
        {
            [id] = KhoiDongTurn.AnswerPhase1(run, correct, spentS)
        };
        var next = state with { Runs = runs };
        return runs[id].Ended ? AdvanceActive(next) : next;
    }

    public static KhoiDongState TimeOutRun(KhoiDongState state)
    {
        if (state.Stage != "phase1") Fail("WRONG_STAGE", "phase 1 is over");
        var id = ActivePlayerId(state);
        if (id is null) Fail("NO_ACTIVE_PLAYER", "no player is answering");

        var runs = new Dictionary<string, Phase1State>(state.Runs)
        {
            [id] = KhoiDongTurn.TimeOutPhase1(state.Runs[id])
        };
        return AdvanceActive(state with { Runs = runs });
    }

    public static KhoiDongState BeginPhase2(KhoiDongState state, IReadOnlyList<string> phase2Ids)
    {
        if (state.Stage != "phase1") Fail("WRONG_STAGE", "phase 1 is over");
        if (!Phase1Complete(state) && !Phase1Untouched(state))
            Fail("PHASE1_INCOMPLETE", "not every player has finished phase 1");
        return state with
        {
            Stage = "phase2",
            Phase2 = KhoiDongTurn.StartPhase2(phase2Ids, state.Rules)
        };
    }

    private static Phase2State RequirePhase2(KhoiDongState state)
    {
        if (state.Stage != "phase2" || state.Phase2 is null) Fail("WRONG_STAGE", "chung is not open");
        if (state.Ended) Fail("ENDED", "the round has ended");
        return state.Phase2;
    }

    public static KhoiDongState OpenWindow(KhoiDongState state, string nowIso)
        => state with { Phase2 = KhoiDongTurn.OpenPhase2Window(RequirePhase2(state), nowIso) };

    public static KhoiDongState JudgeCard(KhoiDongState state, string playerId, bool correct)
        => state with { Phase2 = KhoiDongTurn.JudgePhase2Card(RequirePhase2(state), playerId, correct) };

    public static KhoiDongState NextQuestion(KhoiDongState state)
        => state with { Phase2 = KhoiDongTurn.NextPhase2(RequirePhase2(state)) };

    public static KhoiDongState EndKhoiDong(KhoiDongState state)
    {
        if (state.Ended) return state;
        return state with
        {
            Ended = true,
            Phase2 = state.Phase2 is null ? null : KhoiDongTurn.ClosePhase2(state.Phase2)
        };
    }

    public static int KhoiDongPoints(KhoiDongState state, string playerId)
    {
        var phase1 = state.Runs.TryGetValue(playerId, out var run) ? KhoiDongTurn.Phase1Total(run) : 0;
        var phase2 = state.Phase2 is not null ? KhoiDongTurn.Phase2Points(state.Phase2, playerId) : 0;
        return phase1 + phase2;
    }
}
