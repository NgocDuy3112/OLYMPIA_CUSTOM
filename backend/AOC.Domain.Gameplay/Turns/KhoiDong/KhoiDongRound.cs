using AOC.Domain.Contracts;

namespace AOC.Domain.Gameplay.Turns;

public static class KhoiDongRound
{
    private static void Fail(string code, string message) => throw new RuleError(code, message);

    public static KhoiDongState StartKhoiDong(
        IReadOnlyList<string> playerIds,
        IReadOnlyList<string> phase1Ids,
        RoundRules.KhoiDongRules? rules = null)
    {
        rules ??= RuleBatches.KhoiDong;
        if (playerIds.Count == 0) Fail("VALIDATION", "khoi-dong needs at least one player");

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
        if (state.Flow != Flow.rieng) return null;
        return state.ActiveIndex < state.Order.Count ? state.Order[state.ActiveIndex] : null;
    }

    public static string? ActiveQuestionId(KhoiDongState state)
    {
        if (state.Flow != Flow.rieng) return null;
        var id = ActivePlayerId(state);
        if (id is null) return null;
        return QuestionIdOf(state, id);
    }

    public static string? QuestionIdOf(KhoiDongState state, string playerId)
    {
        if (state.Flow != Flow.rieng) return null;
        if (!state.Runs.TryGetValue(playerId, out var run) || run.Ended) return null;
        return run.Cursor < run.QuestionIds.Count ? run.QuestionIds[run.Cursor] : null;
    }

    public static bool Phase1Complete(KhoiDongState state)
        => state.Order.All(id => state.Runs[id].Ended);

    public static bool Phase1Untouched(KhoiDongState state)
        => state.Order.All(id => state.Runs[id].Results.Count == 0);

    private static KhoiDongState AdvanceActive(KhoiDongState state)
        => state with
        {
            ActiveIndex = Math.Min(state.ActiveIndex + 1, state.Order.Count - 1),
            SelectedPlayerId = null
        };

    public static KhoiDongState RecordOral(
        KhoiDongState state, bool correct, double spentS, string? playerId = null, string? nowIso = null)
    {
        if (state.Flow != Flow.rieng) Fail("WRONG_STAGE", "phase 1 is over");

        if (playerId is not null)
        {
            var index = state.Order.IndexOf(playerId);
            if (index < 0) Fail("NO_ACTIVE_PLAYER", $"{playerId} is not answering");
            state = state with { ActiveIndex = index };
        }

        var id = ActivePlayerId(state);
        if (id is null) Fail("NO_ACTIVE_PLAYER", "no player is answering");
        var run = state.Runs[id];
        if (run.Ended) Fail("RUN_ENDED", $"{id} has finished phase 1");

        var elapsedTotalS = ServerElapsedS(state, run, spentS, nowIso);
        var runs = new Dictionary<string, Phase1State>(state.Runs)
        {
            [id] = KhoiDongTurn.AnswerPhase1(run, correct, elapsedTotalS)
        };
        return state with { Runs = runs, SelectedPlayerId = id };
    }

    private static double ServerElapsedS(KhoiDongState state, Phase1State run, double spentS, string? nowIso)
    {
        if (state.ClockStartedAt is null || nowIso is null) return run.ElapsedS + spentS;
        var elapsed = DateTimeOffset.Parse(nowIso).ToUnixTimeMilliseconds()
            - DateTimeOffset.Parse(state.ClockStartedAt).ToUnixTimeMilliseconds();
        return Math.Max(0, elapsed) / 1000.0;
    }

    public static KhoiDongState SetTurn(KhoiDongState state, string playerId)
    {
        if (state.Flow != Flow.rieng) Fail("WRONG_STAGE", "phase 1 is over");
        var index = state.Order.IndexOf(playerId);
        if (index < 0) Fail("NO_ACTIVE_PLAYER", $"{playerId} is not answering");
        return state with { ActiveIndex = index, SelectedPlayerId = playerId, ClockStarted = false, ClockStartedAt = null };
    }

    public static KhoiDongState StartClock(KhoiDongState state, string nowIso)
    {
        if (state.Flow != Flow.rieng) Fail("WRONG_STAGE", "phase 1 is over");
        if (state.ClockStarted) Fail("ALREADY_OPEN", "the clock is already running");
        return state with { ClockStarted = true, ClockStartedAt = nowIso };
    }

    public static KhoiDongState TimeOutRun(KhoiDongState state)
    {
        if (state.Flow != Flow.rieng) Fail("WRONG_STAGE", "phase 1 is over");
        var id = ActivePlayerId(state);
        if (id is null) Fail("NO_ACTIVE_PLAYER", "no player is answering");

        var runs = new Dictionary<string, Phase1State>(state.Runs)
        {
            [id] = KhoiDongTurn.TimeOutPhase1(state.Runs[id])
        };
        return AdvanceActive(state with { Runs = runs, ClockStarted = false, ClockStartedAt = null });
    }

    public static KhoiDongState BeginPhase2(KhoiDongState state, IReadOnlyList<string> phase2Ids)
    {
        if (state.Flow != Flow.rieng) Fail("WRONG_STAGE", "phase 1 is over");
        if (!Phase1Complete(state) && !Phase1Untouched(state))
            Fail("PHASE1_INCOMPLETE", "not every player has finished phase 1");
        return state with
        {
            Flow = Flow.chung,
            Phase2 = KhoiDongTurn.StartPhase2(phase2Ids, state.Rules)
        };
    }

    private static Phase2State RequirePhase2(KhoiDongState state)
    {
        if (state.Flow != Flow.chung || state.Phase2 is null) Fail("WRONG_STAGE", "chung is not open");
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
