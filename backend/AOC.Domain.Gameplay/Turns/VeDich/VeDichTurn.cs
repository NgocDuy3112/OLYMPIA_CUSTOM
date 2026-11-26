using AOC.Domain.Contracts;

namespace AOC.Domain.Gameplay.Turns;

public static class VeDichTurn
{
    private static readonly int[] Values = [20, 30, 40, 50];
    private static readonly Dictionary<int, int> BoardComposition = new()
    {
        [20] = 6,
        [30] = 6,
        [40] = 4,
        [50] = 4
    };

    private static VeDichRuleError Err(string code, string message) => new(code, message);

    private static List<string> CompositionDiffs(IReadOnlyList<VeDichQuestion> questions)
    {
        var counted = new Dictionary<int, int>();
        foreach (var q in questions)
            counted[q.Value] = counted.GetValueOrDefault(q.Value) + 1;

        var diffs = new List<string>();
        foreach (var value in Values)
        {
            var want = BoardComposition[value];
            var got = counted.GetValueOrDefault(value);
            if (got != want) diffs.Add($"{value}×{got} (want {want})");
        }
        foreach (var (value, got) in counted)
            if (!Values.Contains(value))
                diffs.Add($"{value}×{got} (not a face value)");
        return diffs;
    }

    public static VeDichState CreateVeDich(
        IReadOnlyList<VeDichQuestion> questions,
        IReadOnlyList<VeDichPlayerState> players,
        RoundRules.VeDichRules? rules = null)
    {
        rules ??= RuleBatches.VeDich;
        var diffs = CompositionDiffs(questions);
        if (diffs.Count > 0)
            throw Err("BOARD_COMPOSITION",
                $"ve-dich needs 6×20, 6×30, 4×40, 4×50 — got {string.Join(", ", diffs)}");

        bool IsChung(VeDichQuestion q) => q.Value == 20 || q.Value == 30;
        return new VeDichState
        {
            Rules = rules,
            Phase = 1,
            Players = OrderForPhase(players, 1),
            Remaining = questions.Where(IsChung).ToList(),
            Deferred = questions.Where(q => !IsChung(q)).ToList()
        };
    }

    public static bool Phase1Complete(VeDichState state)
    {
        // Model A: the console confirms one question per player, then walks that
        // batch question by question. Phase 1 ends when the whole confirmed batch
        // has been played out — not after N turns.
        if (state.Phase != 1 || state.Open is not null) return false;
        if (state.PendingPicks.Count > 0) return false;
        var batch = state.TurnQuestions ?? [];
        // Legacy turn-by-turn states have no confirmed batch: they are done once
        // every player had a turn (and at least one question was played).
        if (batch.Count == 0)
            return state.Played.Count > 0 && state.TurnIndex >= state.Players.Count;
        return batch.All(q => state.Played.Any(p => p.Id == q.Id));
    }

    public static bool Phase1Untouched(VeDichState state)
        => state.Phase == 1 && state.TurnIndex == 0 && state.Open is null
            && state.PendingPicks.Count == 0 && state.Played.Count == 0;

    public static bool Phase2Complete(VeDichState state)
        => state.Phase == 2 && state.Open is null && state.TurnIndex >= state.Players.Count;

    public static VeDichState BeginPhase2(VeDichState state)
    {
        if (state.Phase != 1) throw Err("WRONG_PHASE", "already in phase 2");
        if (state.Ended) throw Err("WRONG_PHASE", "the round has already ended");
        if (!Phase1Complete(state) && !Phase1Untouched(state))
            throw Err("PHASE1_INCOMPLETE", "phase 1 is not complete");
        var remaining = new List<VeDichQuestion>(state.Remaining);
        remaining.AddRange(state.Deferred ?? []);
        return state with
        {
            Phase = 2,
            Remaining = remaining,
            Deferred = [],
            Players = OrderForPhase(state.Players, 2),
            TurnIndex = 0,
            SelectedPlayerId = null,
            PendingPicks = [],
            TurnQuestions = [],
            Open = null,
            TurnPicked = 0,
            PicksConfirmed = false
        };
    }

    public static VeDichState EndVeDich(VeDichState state)
        => state.Ended
            ? state
            : state with { Ended = true, Open = null };

    public static List<VeDichPlayerState> OrderForPhase(IReadOnlyList<VeDichPlayerState> players, int phase)
    {
        var sorted = players.ToList();
        sorted.Sort((a, b) => phase == 1
            ? b.Score.CompareTo(a.Score)
            : a.Score.CompareTo(b.Score));
        return sorted;
    }

    public static VeDichPlayerState CurrentPlayer(VeDichState state)
    {
        if (state.TurnIndex >= state.Players.Count)
            throw Err("NO_TURN", "every player already had their turn");
        return state.Players[state.TurnIndex];
    }

    public static VeDichState PickPhase1(VeDichState state, string playerId, string questionId, string? nowIso = null)
    {
        if (state.Phase != 1) throw Err("WRONG_PHASE", "pickPhase1 only applies in Phase 1");
        if (state.Open is not null) throw Err("ALREADY_OPEN", "a question is already open");
        if (CurrentPlayer(state).Id != playerId) throw Err("NOT_YOUR_TURN", "not this player's turn");

        var question = state.Remaining.FirstOrDefault(q => q.Id == questionId);
        if (question is null) throw Err("INVALID_QUESTION", $"question {questionId} is not available");
        if (question.Value != 20 && question.Value != 30)
            throw Err("INVALID_QUESTION", "phase 1 only plays 20- and 30-point questions");

        return state with
        {
            Remaining = state.Remaining.Where(q => q.Id != questionId).ToList(),
            Open = new OpenQuestion
            {
                Question = question,
                Answerer = playerId,
                Power = null,
                Window = AnswerWindow.OralCurrentTurn(playerId),
                Revealed = false
            }
        };
    }

    public static VeDichState PickPhase2(VeDichState state, string playerId, IReadOnlyList<string> questionIds)
    {
        if (state.Phase != 2) throw Err("WRONG_PHASE", "pickPhase2 only applies in Phase 2");
        if (state.Open is not null) throw Err("ALREADY_OPEN", "a question is already open");
        if (CurrentPlayer(state).Id != playerId) throw Err("NOT_YOUR_TURN", "not this player's turn");
        if (questionIds.Count > state.Rules.PickCount)
            throw Err("INVALID_QUESTION", $"Phase 2 takes at most {state.Rules.PickCount} picks");
        if (questionIds.Distinct().Count() != questionIds.Count)
            throw Err("INVALID_QUESTION", "picks must be distinct");

        var pool = state.Remaining.Concat(state.PendingPicks).ToList();
        var picks = questionIds.Select(id => pool.FirstOrDefault(r => r.Id == id)
            ?? throw Err("INVALID_QUESTION", $"question {id} is not available")).ToList();

        return state with
        {
            Remaining = pool.Where(q => !questionIds.Contains(q.Id)).ToList(),
            PendingPicks = picks,
            TurnQuestions = picks,
            TurnPicked = questionIds.Count,
            PicksConfirmed = false
        };
    }

    public static VeDichState ConfirmPicks(VeDichState state)
    {
        if (state.Open is not null) throw Err("ALREADY_OPEN", "a question is already open");
        if (state.PendingPicks.Count == 0) throw Err("NOTHING_PICKED", "pick the questions first");
        // L6: the chung board gives every player one question of their own before
        // the console confirms the batch.
        if (state.Phase == 1 && state.PendingPicks.Count != state.Players.Count)
            throw Err("INVALID_PICKS",
                $"phase 1 confirms one question per player — picked {state.PendingPicks.Count} for {state.Players.Count} players");
        return state with { PicksConfirmed = true };
    }

    public static VeDichState PickRound(VeDichState state, IReadOnlyList<string> questionIds)
    {
        if (state.Phase != 1) throw Err("WRONG_PHASE", "pickRound only applies in Phase 1");
        if (state.Open is not null) throw Err("ALREADY_OPEN", "a question is already open");
        if (questionIds.Count > state.Players.Count)
            throw Err("WRONG_COUNT", $"at most {state.Players.Count} questions — one per player");
        if (questionIds.Distinct().Count() != questionIds.Count)
            throw Err("INVALID_QUESTION", "picks must be distinct");

        var pool = state.Remaining.Concat(state.PendingPicks).ToList();
        var picks = new List<VeDichQuestion>();
        foreach (var id in questionIds)
        {
            var question = pool.FirstOrDefault(q => q.Id == id)
                ?? throw Err("INVALID_QUESTION", $"question {id} is not available");
            if (question.Value != 20 && question.Value != 30)
                throw Err("INVALID_QUESTION", "phase 1 only plays 20- and 30-point questions");
            picks.Add(question);
        }

        return state with
        {
            Remaining = pool.Where(q => !questionIds.Contains(q.Id)).ToList(),
            PendingPicks = picks,
            TurnQuestions = picks,
            PicksConfirmed = false
        };
    }

    public static VeDichState OpenPending(VeDichState state, string questionId)
    {
        if (state.Phase != 1) throw Err("WRONG_PHASE", "openPending only applies in Phase 1");
        var question = state.PendingPicks.FirstOrDefault(q => q.Id == questionId)
            ?? throw Err("INVALID_QUESTION", $"question {questionId} is not picked");
        var pending = state.PendingPicks.Where(q => q.Id != questionId).ToList();

        if (state.Open is not null)
        {
            var open = state.Open;
            if (open.Revealed || open.Window.HasStarted || open.Window.Buzzer is not null)
                throw Err("ALREADY_OPEN", "the question already started — finish it first");
            pending.Insert(0, open.Question);
        }

        return state with
        {
            PendingPicks = pending,
            Open = new OpenQuestion
            {
                Question = question,
                Answerer = "",
                Power = null,
                Window = AnswerWindow.TypedEveryone(
                    RoundRules.VeDichClockSeconds(state.Rules, question.Value) ?? 30),
                Revealed = false
            }
        };
    }

    public static VeDichState SwitchPhase2Question(VeDichState state, string questionId)
    {
        if (state.Phase != 2) throw Err("WRONG_PHASE", "switchQuestion only applies in Phase 2");
        if (state.Open is null) throw Err("NOTHING_OPEN", "no question is open");
        var open = state.Open;
        if (open.Revealed || open.Window.HasStarted || open.Window.Buzzer is not null)
            throw Err("ALREADY_OPEN", "the question already started — finish it first");
        if (open.Question.Id == questionId) return state;

        var question = state.PendingPicks.FirstOrDefault(q => q.Id == questionId)
            ?? throw Err("INVALID_QUESTION", $"question {questionId} is not picked");

        return state with
        {
            PendingPicks = state.PendingPicks
                .Where(q => q.Id != questionId)
                .Concat([open.Question])
                .ToList(),
            Open = open with
            {
                Question = question,
                Revealed = false
            }
        };
    }

    public static VeDichState CloseQuestion(VeDichState state)
    {
        if (state.Phase != 1) throw Err("WRONG_PHASE", "closeQuestion only applies in Phase 1");
        if (state.Open is null) return state;
        // A closed question has been played: it leaves every pool for good, so
        // neither a later advance nor phase 2 can pick it up again.
        var question = state.Open.Question;
        return state with
        {
            Open = null,
            PendingPicks = state.PendingPicks.Where(q => q.Id != question.Id).ToList(),
            Played = MarkPlayed(state.Played, question)
        };
    }

    public static VeDichState NextQuestion(VeDichState state)
    {
        if (state.Phase != 1) throw Err("WRONG_PHASE", "nextQuestion only applies in Phase 1");
        if (state.Open is not null) throw Err("ALREADY_OPEN", "a question is already open");
        if (state.PendingPicks.Count == 0)
            throw Err("NO_PICKS", "no questions are picked");

        var next = state.PendingPicks[0];
        return state with
        {
            PendingPicks = state.PendingPicks.Skip(1).ToList(),
            Open = new OpenQuestion
            {
                Question = next,
                Answerer = "",
                Power = null,
                Window = AnswerWindow.TypedEveryone(
                    RoundRules.VeDichClockSeconds(state.Rules, next.Value) ?? 30),
                Revealed = false
            }
        };
    }

    public static VeDichState ClearPicks(VeDichState state)
    {
        if (state.Phase != 1) throw Err("WRONG_PHASE", "clearPicks only applies in Phase 1");
        if (state.Open is not null) throw Err("ALREADY_OPEN", "a question is open — play it out first");
        if (state.PendingPicks.Count == 0) return state;
        return state with
        {
            Remaining = state.Remaining.Concat(state.PendingPicks).ToList(),
            PendingPicks = [],
            PicksConfirmed = false
        };
    }

    public static VeDichState DeclarePower(
        VeDichState state,
        string playerId,
        PowerKind? power,
        string? targetId = null)
    {
        if (state.Phase != 2)
            throw Err("WRONG_PHASE_FOR_POWER", "powers only exist in Về đích Riêng (phase 2)");
        if (state.Open is not null)
            throw Err("ALREADY_OPEN", "the question already started — powers are off");
        if (CurrentPlayer(state).Id != playerId)
            throw Err("NOT_YOUR_TURN", "only the current player's power may be staged");
        if (state.PendingPicks.Count == 0)
            throw Err("NOTHING_OPEN", "pick the turn's questions first");
        if (power is null)
        {
            // Nothing was spent yet — cancelling hands the turn's power back.
            var cleared = state.Players.Select(p => p.Id == playerId
                ? p with { Powers = p.Powers.Unstage() }
                : p).ToList();
            return state with { Players = cleared };
        }

        if (power == PowerKind.ASSIGN)
        {
            if (targetId is null) throw Err("INVALID_TARGET", "ASSIGN needs a player to hand the question to");
            if (targetId == playerId) throw Err("INVALID_TARGET", "you cannot assign the question to yourself");
            if (!state.Players.Any(p => p.Id == targetId))
                throw Err("INVALID_TARGET", $"{targetId} is not playing this round");
        }

        var owner = state.Players.First(p => p.Id == playerId);
        // An empty set means the turn's single power was already spent.
        if (owner.Powers.Available.Count == 0)
            throw Err("POWER_UNAVAILABLE", "the turn's power was already used");
        if (owner.Powers.UsedThisTurn)
            throw Err("ONE_POWER_PER_TURN", "the turn has already chosen its power");
        if (!owner.Powers.Available.Contains(power.Value))
            throw Err("POWER_UNAVAILABLE", $"{power} already spent");

        var players = state.Players.Select(p => p.Id == playerId
            ? p with { Powers = p.Powers.Stage(power.Value, targetId) }
            : p).ToList();
        return state with { Players = players };
    }

    public static VeDichState OpenPhase2Question(VeDichState state, string questionId, string? nowIso = null)
    {
        if (state.Phase != 2) throw Err("WRONG_PHASE", "openPhase2Question only applies in Phase 2");
        if (state.Open is not null) throw Err("ALREADY_OPEN", "a question is already open");

        var question = state.PendingPicks.FirstOrDefault(q => q.Id == questionId);
        if (question is null)
            throw Err("INVALID_QUESTION", $"question {questionId} is not one of this turn's picks");

        var answerer = CurrentPlayer(state).Id;
        var staged = state.Players.First(p => p.Id == answerer).Powers.Staged;
        var isAssign = staged?.Power == PowerKind.ASSIGN;
        if (isAssign && nowIso is null) throw Err("INVALID_TARGET", "ASSIGN needs the server clock to open the race");
        if (isAssign && staged!.TargetId is null)
            throw Err("INVALID_TARGET", "ASSIGN needs a player to hand the question to");

        AnswerWindow window;
        if (isAssign)
        {
            var clock = RoundRules.VeDichClockSeconds(state.Rules, question.Value) ?? state.Rules.BuzzWindowS;
            window = AnswerWindow.BuzzPair(answerer, staged!.TargetId!, clock);
        }
        else
        {
            window = AnswerWindow.OralCurrentTurn(answerer);
        }

        var players = staged is null
            ? state.Players
            : state.Players.Select(p =>
                p.Id == answerer
                    ? p with { Powers = p.Powers.Spend(staged.Power) with { Staged = null } }
                    : p).ToList();

        return state with
        {
            Players = players,
            PendingPicks = state.PendingPicks.Where(q => q.Id != questionId).ToList(),
            Open = new OpenQuestion
            {
                Question = question,
                Answerer = answerer,
                Power = staged?.Power,
                Window = window,
                Revealed = false
            }
        };
    }

    public static VeDichState RevealQuestion(VeDichState state, string nowIso)
    {
        if (state.Open is null) throw Err("NOTHING_OPEN", "no question is open");
        if (state.Open.Revealed) return state;

        var open = state.Open with { Revealed = true };
        if (open.Window.Mode == AnswerMode.Buzz && !open.Window.HasStarted)
            return state with
            {
                Open = open with { Window = open.Window.OpenFor(nowIso, BuzzWindowSeconds(state)) }
            };
        return state with { Open = open };
    }

    public static VeDichState StartClock(VeDichState state, string nowIso)
    {
        if (state.Open is null) throw Err("NOTHING_OPEN", "no question is open");
        if (!state.Open.Revealed) throw Err("NOT_REVEALED", "reveal the question first");

        if (state.Open.Window.Locked)
            throw Err("ALREADY_OPEN", "the answer window is locked");
        // The clock is a budget, not a stopwatch: starting it again would hand the
        // answerer a fresh countdown.
        if (state.Open.Window.HasStarted)
            throw Err("ALREADY_OPEN", "the question's clock already started");

        var clock = RoundRules.VeDichClockSeconds(state.Rules, state.Open.Question.Value);
        AnswerWindow window;
        if (clock is null)
        {
            window = state.Open.Window with { OpenedAt = nowIso, ClosesAt = null, Locked = false };
        }
        else
        {
            window = state.Open.Window with
            {
                OpenedAt = nowIso,
                Seconds = clock.Value,
                ClosesAt = null,
                Locked = false
            };
        }

        return state with { Open = state.Open with { Window = window } };
    }

    public static VeDichState CloseCurrentAnswer(VeDichState state, string nowIso)
    {
        if (state.Open is null) throw Err("NOTHING_OPEN", "no question is open");
        if (state.Phase != 2) return state;
        if (state.Open.Window.Mode != AnswerMode.Oral)
            throw Err("ALREADY_OPEN", "the buzz window already happened");
        // L5: the buzz window may only open once the question's clock has run out —
        // no early buzz and no buzz before the clock was ever started.
        if (!state.Open.Window.HasStarted)
            throw Err("CLOCK_NOT_STARTED", "the question's clock has not started yet");
        if (state.Open.Window.IsOpen(nowIso))
            throw Err("CLOCK_STILL_RUNNING", "the question's clock is still running");

        return state with
        {
            Open = state.Open with
            {
                Window = state.Open.Window.ReopenAsBuzz(
                    state.Open.Answerer, state.Rules.BuzzWindowS, nowIso)
            }
        };
    }

    public static int BuzzWindowSeconds(VeDichState state)
    {
        if (state.Open?.Window.Seconds is { } seconds) return seconds;
        return state.Rules.BuzzWindowS;
    }

    public static VeDichState LockBuzzWindow(VeDichState state)
    {
        if (state.Open is null) throw Err("NOTHING_OPEN", "no question is open");
        if (state.Open.Window.Mode != AnswerMode.Buzz)
            throw Err("ALREADY_OPEN", "there is no open buzz window");
        if (state.Open.Window.Buzzer is not null)
            throw Err("ALREADY_OPEN", "someone already buzzed — the race is settled");
        if (!state.Open.Window.HasStarted)
            throw Err("ALREADY_OPEN", "the buzz window has not opened yet");
        return state with { Open = state.Open with { Window = state.Open.Window.Lock() } };
    }

    public static bool IsBuzzOpen(VeDichState state, string nowIso)
    {
        if (state.Open is null) return false;
        if (state.Open.Window.Mode != AnswerMode.Buzz) return false;
        return state.Open.Window.IsOpen(nowIso);
    }

    public static VeDichState Buzz(VeDichState state, string playerId, string nowIso)
    {
        if (state.Open is null) throw Err("NOTHING_OPEN", "no question is open");
        if (state.Phase != 2) throw Err("WRONG_PHASE", "buzzing only exists in Phase 2");
        if (state.Open.Window.Mode != AnswerMode.Buzz)
            throw Err("ALREADY_OPEN", "the buzz window is not open");
        if (!state.Open.Window.IsOpen(nowIso))
            throw Err("WINDOW_CLOSED", "the buzz window has closed");
        if (state.Open.Window.Buzzer is not null)
            throw Err("ALREADY_OPEN", "someone already buzzed first");
        if (state.Open.Window.Eligibility == AnswerEligibility.Others
            && playerId == state.Open.Window.TurnPlayerId)
            throw Err("NOT_YOUR_TURN", "you are answering this question, not buzzing it");
        if (state.Open.Window.Eligibility == AnswerEligibility.Pair
            && playerId != state.Open.Window.PairA
            && playerId != state.Open.Window.PairB)
            throw Err("NOT_YOUR_TURN", "this race is between the two assigned players");

        return state with
        {
            Open = state.Open with { Window = state.Open.Window.Buzz(playerId, nowIso) }
        };
    }

    public static VeDichState ResolveQuestion(VeDichState state, Verdicts verdicts, string nowIso)
    {
        if (state.Open is null) throw Err("NOTHING_OPEN", "no question is open");
        var open = state.Open;
        // Phase 1 typed questions are answered by everyone at once, so there is no
        // single answerer to score (and no user id to write an answer for) — the
        // console grades each player with the judge action instead.
        if (state.Phase == 1 && open.Answerer.Length == 0)
            throw Err("INVALID_ANSWERER",
                "phase 1 questions have no single answerer — judge every player instead");
        var partner = PartnerOf(open);

        if (open.Window.Mode == AnswerMode.Oral && state.Phase == 2)
            throw Err("ALREADY_OPEN", "the question is still open");
        // An ASSIGN duel in flight is settled by locking the buzz window alone —
        // "hết lượt" must not hand out the nobody-buzzed −50/−50 before the race has
        // opened or while the two players are still racing.
        var pairRaceSettled = open.Window.HasStarted && !open.Window.IsOpen(nowIso);
        if (partner is not null && open.Window.Buzzer is null && !pairRaceSettled)
            throw Err("RACE_IN_PROGRESS",
                "the assigned duel is not settled — wait for the race or lock the buzz window");

        if (partner is not null)
        {
            if (open.Window.Buzzer is not null && verdicts.Buzzer is null)
                throw Err("NOT_YOUR_TURN", "a buzzer was recorded, a buzzer verdict is required");
            return ResolveAssign(state, verdicts);
        }
        if (open.Window.Buzzer is not null && verdicts.Buzzer is null)
            throw Err("NOT_YOUR_TURN", "a buzzer was recorded, a buzzer verdict is required");
        if (open.Window.Buzzer is null && verdicts.Buzzer is not null)
            throw Err("NOT_YOUR_TURN", "no buzzer was recorded, buzzer verdict not allowed");

        var face = open.Question.Value;
        var answererPoints = Scoring.VeDichScoring.Points(
            face, verdicts.Answerer, state.Rules, open.Power == PowerKind.STAR);
        var buzzerPoints = open.Window.Buzzer is not null
            ? Scoring.VeDichScoring.Points(face, verdicts.Buzzer!.Value, state.Rules)
            : 0;

        var deltas = new List<(string Id, int Delta)> { (open.Answerer, answererPoints) };
        if (open.Window.Buzzer is not null) deltas.Add((open.Window.Buzzer, buzzerPoints));
        return ApplyDeltas(state, deltas, open.Question);
    }

    private static VeDichState ResolveAssign(VeDichState state, Verdicts verdicts)
    {
        var open = state.Open!;
        var partner = PartnerOf(open)!;
        var buzzer = open.Window.Buzzer;

        if (buzzer is null)
        {
            var payout = Scoring.VeDichScoring.Assign(open.Question.Value, null, state.Rules.Assign);
            return ApplyDeltas(state, [(open.Answerer, payout.Buzzer), (partner, payout.Partner)], open.Question);
        }

        var payout2 = Scoring.VeDichScoring.Assign(open.Question.Value, verdicts.Buzzer, state.Rules.Assign);
        var other = buzzer == open.Answerer ? partner : open.Answerer;
        return ApplyDeltas(state, [(buzzer, payout2.Buzzer), (other, payout2.Partner)], open.Question);
    }

    private static string? PartnerOf(OpenQuestion open)
        => open.Window.Eligibility == AnswerEligibility.Pair ? open.Window.PairB : null;

    private static List<VeDichQuestion> MarkPlayed(
        IReadOnlyList<VeDichQuestion> played, VeDichQuestion question)
        => played.Any(q => q.Id == question.Id) ? played.ToList() : [.. played, question];

    private static VeDichState ApplyDeltas(
        VeDichState state, IReadOnlyList<(string Id, int Delta)> deltas, VeDichQuestion question)
    {
        var scoreDelta = new Dictionary<string, int>();
        foreach (var (id, delta) in deltas)
            scoreDelta[id] = scoreDelta.GetValueOrDefault(id) + delta;

        return state with
        {
            Players = state.Players.Select(p =>
                scoreDelta.TryGetValue(p.Id, out var delta) ? p with { Score = p.Score + delta } : p).ToList(),
            // A resolved question is done for the round: keep it out of every pool.
            Played = MarkPlayed(state.Played, question),
            Open = null
        };
    }

    public static VeDichState AdvanceTurn(VeDichState state)
    {
        if (state.Open is not null) throw Err("ALREADY_OPEN", "finish the open question first");
        return state with
        {
            TurnIndex = state.TurnIndex + 1,
            SelectedPlayerId = null,
            // Unplayed picks go back to the pool so a later turn can play them.
            // Played questions are absent from PendingPicks and stay off the board.
            Remaining = state.Remaining.Concat(state.PendingPicks).ToList(),
            PendingPicks = [],
            TurnQuestions = [],
            Players = state.Players.Select(p => p with { Powers = p.Powers.ResetForTurn() }).ToList(),
            TurnPicked = 0,
            PicksConfirmed = false
        };
    }

    public static VeDichState SetTurn(VeDichState state, string playerId)
    {
        if (state.Phase != 2) throw Err("WRONG_PHASE", "setTurn only applies in phase 2");
        if (state.Open is not null) throw Err("ALREADY_OPEN", "finish the open question first");

        var index = state.Players.FindIndex(p => p.Id == playerId);
        if (index < 0) throw Err("INVALID_PLAYER", $"{playerId} is not playing this round");
        if (index == state.TurnIndex)
            return state with { SelectedPlayerId = playerId };

        return state with
        {
            TurnIndex = index,
            SelectedPlayerId = playerId,
            Remaining = state.Remaining.Concat(state.PendingPicks).ToList(),
            PendingPicks = [],
            TurnQuestions = [],
            Players = state.Players.Select(p => p with { Powers = p.Powers.ResetForTurn() }).ToList(),
            TurnPicked = 0,
            PicksConfirmed = false
        };
    }
}
