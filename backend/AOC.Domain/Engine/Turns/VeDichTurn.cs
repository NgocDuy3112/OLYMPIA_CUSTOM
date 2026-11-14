using System.Text.Json.Serialization;
using AOC.Domain.Contracts;

namespace AOC.Domain.Engine.Turns;

public sealed record VeDichQuestion
{
    [JsonPropertyName("id")] public required string Id { get; init; }
    [JsonPropertyName("value")] public required int Value { get; init; }

    [JsonPropertyName("timeLimit")]
    public int? TimeLimit { get; init; }
}

public sealed record VeDichPlayerState
{
    [JsonPropertyName("id")] public required string Id { get; init; }
    [JsonPropertyName("score")] public int Score { get; init; }
    [JsonPropertyName("powersLeft")] public List<Power> PowersLeft { get; init; } = [];
}

public sealed record StagedPower
{
    [JsonPropertyName("power")] public required Power Power { get; init; }

    [JsonPropertyName("targetId")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? TargetId { get; init; }
}

public sealed record OpenQuestion
{
    [JsonPropertyName("question")] public required VeDichQuestion Question { get; init; }
    [JsonPropertyName("answerer")] public required string Answerer { get; init; }
    [JsonPropertyName("power")] public Power? Power { get; init; }
    [JsonPropertyName("stage")] public required string Stage { get; init; } // current | buzz

    /// <summary>When the answering stage opened — the value-keyed clock counts from here.</summary>
    [JsonPropertyName("openedAt")]
    public string? OpenedAt { get; init; }

    /// <summary>The controller revealed it — players and the audience see the question only from here.</summary>
    [JsonPropertyName("revealed")]
    public bool Revealed { get; init; }

    [JsonPropertyName("buzzer")] public string? Buzzer { get; init; }

    [JsonPropertyName("buzzerMs")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public int? BuzzerMs { get; init; }

    [JsonPropertyName("assignedTo")]
    public string? AssignedTo { get; init; }
}

public sealed record VeDichState
{
    [JsonPropertyName("rules")] public RoundRules.VeDichRules Rules { get; init; } = RoundRules.DefaultVeDich();
    [JsonPropertyName("phase")] public int Phase { get; init; } = 1;
    [JsonPropertyName("players")] public List<VeDichPlayerState> Players { get; init; } = [];
    [JsonPropertyName("remaining")] public List<VeDichQuestion> Remaining { get; init; } = [];

    [JsonPropertyName("deferred")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public List<VeDichQuestion>? Deferred { get; init; }

    [JsonPropertyName("turnIndex")] public int TurnIndex { get; init; }
    [JsonPropertyName("pendingPicks")] public List<VeDichQuestion> PendingPicks { get; init; } = [];
    [JsonPropertyName("open")] public OpenQuestion? Open { get; init; }
    [JsonPropertyName("buzzOpenedAt")] public string? BuzzOpenedAt { get; init; }

    [JsonPropertyName("buzzLocked")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public bool? BuzzLocked { get; init; }

    [JsonPropertyName("ended")] public bool Ended { get; init; }

    [JsonPropertyName("stagedPower")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public StagedPower? StagedPower { get; init; }

    [JsonPropertyName("turnPowerUsed")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public bool? TurnPowerUsed { get; init; }

    /// <summary>Phase 2: how many questions the current turn picked. It stays at
    /// the batch size while questions open, so the console can tell a turn in
    /// progress (2 left of 3) from a batch still being assembled (1 of 3).</summary>
    [JsonPropertyName("turnPicked")]
    public int TurnPicked { get; init; }

    [JsonPropertyName("revealedAnswer")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? RevealedAnswer { get; init; }
}

public sealed record Verdicts(bool Answerer, bool? Buzzer);

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
        rules ??= RoundRules.DefaultVeDich();
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
        => state.Phase == 1 && state.Open is null && state.TurnIndex >= state.Players.Count;

    public static bool Phase1Untouched(VeDichState state)
        => state.Phase == 1 && state.TurnIndex == 0 && state.Open is null && state.PendingPicks.Count == 0;

    public static bool Phase2Complete(VeDichState state)
        => state.Phase == 2 && state.Open is null && state.TurnIndex >= state.Players.Count;

    public static VeDichState BeginPhase2(VeDichState state)
    {
        if (state.Phase != 1) throw Err("WRONG_PHASE", "already in phase 2");
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
            PendingPicks = [],
            Open = null,
            BuzzOpenedAt = null,
            BuzzLocked = false,
            TurnPicked = 0
        };
    }

    public static VeDichState EndVeDich(VeDichState state)
        => state.Ended
            ? state
            : state with { Ended = true, Open = null, BuzzOpenedAt = null, BuzzLocked = false };

    public static List<VeDichPlayerState> OrderForPhase(IReadOnlyList<VeDichPlayerState> players, int phase)
    {
        var sorted = players.ToList();
        sorted.Sort((a, b) => phase == 1
            ? b.Score.CompareTo(a.Score)
            : a.Score.CompareTo(b.Score));
        return sorted;
    }

    public static VeDichPlayerState CurrentPlayer(VeDichState state) => state.Players[state.TurnIndex];

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
                Stage = "current",
                OpenedAt = null,
                Revealed = false,
                Buzzer = null,
                AssignedTo = null
            },
            BuzzOpenedAt = null,
            BuzzLocked = false
        };
    }

    /// <summary>Phase 2's pick. The console sends the turn's whole set on every
    /// click, so this replaces whatever was picked before — an empty set puts the
    /// questions back on the board. At most three.</summary>
    public static VeDichState PickPhase2(VeDichState state, string playerId, IReadOnlyList<string> questionIds)
    {
        if (state.Phase != 2) throw Err("WRONG_PHASE", "pickPhase2 only applies in Phase 2");
        if (state.Open is not null) throw Err("ALREADY_OPEN", "a question is already open");
        if (CurrentPlayer(state).Id != playerId) throw Err("NOT_YOUR_TURN", "not this player's turn");
        if (questionIds.Count > 3) throw Err("INVALID_QUESTION", "Phase 2 takes at most 3 picks");
        if (questionIds.Distinct().Count() != questionIds.Count)
            throw Err("INVALID_QUESTION", "picks must be distinct");

        var pool = state.Remaining.Concat(state.PendingPicks).ToList();
        var picks = questionIds.Select(id => pool.FirstOrDefault(r => r.Id == id)
            ?? throw Err("INVALID_QUESTION", $"question {id} is not available")).ToList();

        return state with
        {
            Remaining = pool.Where(q => !questionIds.Contains(q.Id)).ToList(),
            PendingPicks = picks,
            TurnPicked = questionIds.Count
        };
    }

    /// <summary>Phase 1's batch pick — one question per player, played one at a
    /// time. Like PickPhase2 this replaces the set on every click, so the console
    /// can take a question back without a separate undo action.</summary>
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
            PendingPicks = picks
        };
    }

    /// <summary>Opens the next picked question — the first one while nothing is open —
    /// and closes the set once the last question has been played.</summary>
    public static VeDichState NextQuestion(VeDichState state)
    {
        if (state.Phase != 1) throw Err("WRONG_PHASE", "nextQuestion only applies in Phase 1");
        if (state.Open is null && state.PendingPicks.Count == 0)
            throw Err("NO_PICKS", "no questions are picked");

        if (state.PendingPicks.Count == 0)
            return state with { Open = null, BuzzOpenedAt = null, BuzzLocked = false };

        var next = state.PendingPicks[0];
        return state with
        {
            PendingPicks = state.PendingPicks.Skip(1).ToList(),
            Open = new OpenQuestion
            {
                Question = next,
                Answerer = "",
                Power = null,
                Stage = "current",
                OpenedAt = null,
                Revealed = false,
                Buzzer = null,
                AssignedTo = null
            },
            BuzzOpenedAt = null,
            BuzzLocked = false
        };
    }

    /// <summary>Puts the picked questions back so the controller can re-pick.</summary>
    public static VeDichState ClearPicks(VeDichState state)
    {
        if (state.Phase != 1) throw Err("WRONG_PHASE", "clearPicks only applies in Phase 1");
        if (state.Open is not null) throw Err("ALREADY_OPEN", "a question is open — play it out first");
        if (state.PendingPicks.Count == 0) return state;
        return state with
        {
            Remaining = state.Remaining.Concat(state.PendingPicks).ToList(),
            PendingPicks = []
        };
    }

    public static VeDichState DeclarePower(
        VeDichState state,
        string playerId,
        Power? power,
        string? targetId = null)
    {
        if (state.Phase != 2)
            throw Err("WRONG_PHASE_FOR_POWER", "powers only exist in Về đích Riêng (phase 2)");
        if (state.Open is not null)
            throw Err("ALREADY_OPEN", "powers are declared before the question opens");
        if (CurrentPlayer(state).Id != playerId)
            throw Err("NOT_YOUR_TURN", "only the current player's power may be staged");
        if (state.PendingPicks.Count == 0)
            throw Err("NOTHING_OPEN", "pick the turn's questions first");
        if (power is null) return state;

        if (state.TurnPowerUsed == true)
            throw Err("ONE_POWER_PER_TURN", "the turn has already chosen its power");

        var player = state.Players.First(p => p.Id == playerId);
        if (!player.PowersLeft.Contains(power.Value))
            throw Err("POWER_UNAVAILABLE", $"{power} already spent");
        if (power == Power.ASSIGN)
        {
            if (targetId is null) throw Err("INVALID_TARGET", "ASSIGN needs a player to hand the question to");
            if (targetId == playerId) throw Err("INVALID_TARGET", "you cannot assign the question to yourself");
            if (!state.Players.Any(p => p.Id == targetId))
                throw Err("INVALID_TARGET", $"{targetId} is not playing this round");
            return state with
            {
                StagedPower = new StagedPower { Power = power.Value, TargetId = targetId },
                TurnPowerUsed = true
            };
        }
        return state with
        {
            StagedPower = new StagedPower { Power = power.Value },
            TurnPowerUsed = true
        };
    }

    public static VeDichState OpenPhase2Question(VeDichState state, string questionId, string? nowIso = null)
    {
        if (state.Phase != 2) throw Err("WRONG_PHASE", "openPhase2Question only applies in Phase 2");
        if (state.Open is not null) throw Err("ALREADY_OPEN", "a question is already open");

        var question = state.PendingPicks.FirstOrDefault(q => q.Id == questionId);
        if (question is null)
            throw Err("INVALID_QUESTION", $"question {questionId} is not one of this turn's picks");

        var staged = state.StagedPower;
        var isAssign = staged?.Power == Power.ASSIGN;
        if (isAssign && nowIso is null) throw Err("INVALID_TARGET", "ASSIGN needs the server clock to open the race");
        var answerer = CurrentPlayer(state).Id;
        var players = staged is null
            ? state.Players
            : state.Players.Select(p =>
                p.Id == answerer
                    ? p with { PowersLeft = p.PowersLeft.Where(x => x != staged.Power).ToList() }
                    : p).ToList();

        return state with
        {
            Players = players,
            StagedPower = null,
            TurnPowerUsed = staged is not null || state.TurnPowerUsed == true,
            PendingPicks = state.PendingPicks.Where(q => q.Id != questionId).ToList(),
            Open = new OpenQuestion
            {
                Question = question,
                Answerer = answerer,
                Power = staged?.Power,
                Stage = isAssign ? "buzz" : "current",
                OpenedAt = null,
                Revealed = false,
                Buzzer = null,
                AssignedTo = isAssign ? staged!.TargetId : null
            },
            BuzzOpenedAt = null,
            BuzzLocked = false
        };
    }

    /// <summary>The controller shows the question — players, the audience and (for an
    /// assigned power) the buzz window all start here.</summary>
    public static VeDichState RevealQuestion(VeDichState state, string nowIso)
    {
        if (state.Open is null) throw Err("NOTHING_OPEN", "no question is open");
        if (state.Open.Revealed) return state;

        var open = state.Open with { Revealed = true };
        if (open.Stage == "buzz" && state.BuzzOpenedAt is null)
            return state with { Open = open, BuzzOpenedAt = nowIso };
        return state with { Open = open };
    }

    /// <summary>Tính giờ — starts (or restarts) the clock, once the question is revealed.</summary>
    public static VeDichState StartClock(VeDichState state, string nowIso)
    {
        if (state.Open is null) throw Err("NOTHING_OPEN", "no question is open");
        if (!state.Open.Revealed) throw Err("NOT_REVEALED", "reveal the question first");

        if (state.Open.Stage == "buzz")
            return state with { BuzzOpenedAt = nowIso };
        return state with { Open = state.Open with { OpenedAt = nowIso } };
    }

    public static VeDichState CloseCurrentAnswer(VeDichState state, string openedAt)
    {
        if (state.Open is null) throw Err("NOTHING_OPEN", "no question is open");
        if (state.Phase != 2) return state;
        if (state.Open.Stage != "current") throw Err("ALREADY_OPEN", "the buzz window already happened");

        return state with
        {
            Open = state.Open with { Stage = "buzz" },
            BuzzOpenedAt = openedAt,
            BuzzLocked = false
        };
    }

    public static int BuzzWindowSeconds(VeDichState state)
    {
        if (state.Open?.Power == Power.ASSIGN)
            return state.Open.Question.TimeLimit ?? state.Rules.BuzzWindowS;
        return state.Rules.BuzzWindowS;
    }

    public static VeDichState LockBuzzWindow(VeDichState state)
    {
        if (state.Open is null) throw Err("NOTHING_OPEN", "no question is open");
        if (state.Open.Stage != "buzz") throw Err("ALREADY_OPEN", "there is no open buzz window");
        if (state.Open.Buzzer is not null) throw Err("ALREADY_OPEN", "someone already buzzed — the race is settled");
        return state with { BuzzLocked = true };
    }

    public static bool IsBuzzOpen(VeDichState state, string nowIso)
    {
        if (state.BuzzLocked == true) return false;
        if (state.Open is null || state.Open.Stage != "buzz" || state.BuzzOpenedAt is null) return false;
        var elapsed = DateTimeOffset.Parse(nowIso).ToUnixTimeMilliseconds()
            - DateTimeOffset.Parse(state.BuzzOpenedAt).ToUnixTimeMilliseconds();
        return elapsed >= 0 && elapsed <= BuzzWindowSeconds(state) * 1000;
    }

    public static bool MayBuzz(VeDichState state, string playerId)
    {
        if (state.Open is null) return false;
        var assignedTo = state.Open.AssignedTo;
        if (assignedTo is not null)
            return playerId == state.Open.Answerer || playerId == assignedTo;
        return playerId != state.Open.Answerer;
    }

    public static VeDichState Buzz(VeDichState state, string playerId, string nowIso)
    {
        if (state.Open is null) throw Err("NOTHING_OPEN", "no question is open");
        if (state.Phase != 2) throw Err("WRONG_PHASE", "buzzing only exists in Phase 2");
        if (state.Open.Stage != "buzz") throw Err("ALREADY_OPEN", "the buzz window is not open");
        if (!IsBuzzOpen(state, nowIso)) throw Err("WINDOW_CLOSED", "the buzz window has closed");
        if (state.Open.Buzzer is not null) throw Err("ALREADY_OPEN", "someone already buzzed first");
        if (!MayBuzz(state, playerId)) throw Err("NOT_YOUR_TURN", "this question is not yours to buzz");

        var buzzerMs = state.BuzzOpenedAt is null
            ? 0
            : Math.Max(0, DateTimeOffset.Parse(nowIso).ToUnixTimeMilliseconds()
                - DateTimeOffset.Parse(state.BuzzOpenedAt).ToUnixTimeMilliseconds());

        return state with { Open = state.Open with { Buzzer = playerId, BuzzerMs = (int)buzzerMs } };
    }

    public static VeDichState ResolveQuestion(VeDichState state, Verdicts verdicts)
    {
        if (state.Open is null) throw Err("NOTHING_OPEN", "no question is open");
        var open = state.Open;
        var assignedTo = open.AssignedTo;

        if (open.Stage == "current" && state.Phase == 2)
            throw Err("ALREADY_OPEN", "the question is still open");

        if (assignedTo is not null)
        {
            if (open.Buzzer is not null && verdicts.Buzzer is null)
                throw Err("NOT_YOUR_TURN", "a buzzer was recorded, a buzzer verdict is required");
            return ResolveAssign(state, verdicts);
        }
        if (open.Buzzer is not null && verdicts.Buzzer is null)
            throw Err("NOT_YOUR_TURN", "a buzzer was recorded, a buzzer verdict is required");
        if (open.Buzzer is null && verdicts.Buzzer is not null)
            throw Err("NOT_YOUR_TURN", "no buzzer was recorded, buzzer verdict not allowed");

        var face = open.Question.Value;
        var answererPoints = Scoring.VeDichScoring.Points(
            face, verdicts.Answerer, state.Rules, open.Power == Power.STAR);
        var buzzerPoints = open.Buzzer is not null
            ? Scoring.VeDichScoring.Points(face, verdicts.Buzzer!.Value, state.Rules)
            : 0;

        var deltas = new List<(string Id, int Delta)> { (open.Answerer, answererPoints) };
        if (open.Buzzer is not null) deltas.Add((open.Buzzer, buzzerPoints));
        return ApplyDeltas(state, deltas);
    }

    private static VeDichState ResolveAssign(VeDichState state, Verdicts verdicts)
    {
        var open = state.Open!;
        var partner = open.AssignedTo!;
        var buzzer = open.Buzzer;

        if (buzzer is null)
        {
            var payout = Scoring.VeDichScoring.Assign(open.Question.Value, null);
            return ApplyDeltas(state, [(open.Answerer, payout.Buzzer), (partner, payout.Partner)]);
        }

        var payout2 = Scoring.VeDichScoring.Assign(open.Question.Value, verdicts.Buzzer);
        var other = buzzer == open.Answerer ? partner : open.Answerer;
        return ApplyDeltas(state, [(buzzer, payout2.Buzzer), (other, payout2.Partner)]);
    }

    private static VeDichState ApplyDeltas(VeDichState state, IReadOnlyList<(string Id, int Delta)> deltas)
    {
        var scoreDelta = new Dictionary<string, int>();
        foreach (var (id, delta) in deltas)
            scoreDelta[id] = scoreDelta.GetValueOrDefault(id) + delta;

        return state with
        {
            Players = state.Players.Select(p =>
                scoreDelta.TryGetValue(p.Id, out var delta) ? p with { Score = p.Score + delta } : p).ToList(),
            Open = null,
            BuzzOpenedAt = null,
            BuzzLocked = false
        };
    }

    public static VeDichState AdvanceTurn(VeDichState state)
    {
        if (state.Open is not null) throw Err("ALREADY_OPEN", "finish the open question first");
        return state with
        {
            TurnIndex = state.TurnIndex + 1,
            PendingPicks = [],
            StagedPower = null,
            TurnPowerUsed = false,
            TurnPicked = 0
        };
    }

    /// <summary>The console picks who plays next — the rail card on the phase-2 pick
    /// board. Any staged picks or power belonged to the player being left, so they
    /// go back to the board instead of being dropped.</summary>
    public static VeDichState SetTurn(VeDichState state, string playerId)
    {
        if (state.Phase != 2) throw Err("WRONG_PHASE", "setTurn only applies in phase 2");
        if (state.Open is not null) throw Err("ALREADY_OPEN", "finish the open question first");

        var index = state.Players.FindIndex(p => p.Id == playerId);
        if (index < 0) throw Err("INVALID_PLAYER", $"{playerId} is not playing this round");
        if (index == state.TurnIndex) return state;

        return state with
        {
            TurnIndex = index,
            Remaining = state.Remaining.Concat(state.PendingPicks).ToList(),
            PendingPicks = [],
            StagedPower = null,
            TurnPowerUsed = false,
            TurnPicked = 0
        };
    }
}
