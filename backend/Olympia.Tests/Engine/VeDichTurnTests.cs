using Olympia.Domain.Contracts;
using Olympia.Domain.Engine;
using Olympia.Domain.Engine.Turns;
using Xunit;

namespace Olympia.Tests.Engine;

public class VeDichTurnTests
{
    private const string Now = "2026-01-01T00:00:00.000Z";

    private static string At(double sec) =>
        DateTimeOffset.Parse(Now).AddMilliseconds((long)(sec * 1000)).UtcDateTime
            .ToString("yyyy-MM-ddTHH:mm:ss.fffZ");

    private static VeDichQuestion Cell(int value, int n, int? timeLimit = 30)
        => new() { Id = $"{value}-{n}", Value = value, TimeLimit = timeLimit };

    private static List<VeDichQuestion> Cells(int value, int count, int? timeLimit = 30)
        => Enumerable.Range(1, count).Select(n => Cell(value, n, timeLimit)).ToList();

    private static List<VeDichQuestion> Board() =>
    [
        .. Cells(20, 6), .. Cells(30, 6), .. Cells(40, 4), .. Cells(50, 4)
    ];

    private static readonly List<VeDichQuestion> Pool = Board();

    private static int CountOf(IEnumerable<VeDichQuestion> qs, int value)
        => qs.Count(q => q.Value == value);

    private static VeDichPlayerState Player(string id, int score) => new()
    {
        Id = id,
        Score = score,
        PowersLeft = [Power.STAR, Power.ASSIGN]
    };

    private static string CodeOf(Action fn)
    {
        try
        {
            fn();
        }
        catch (VeDichRuleError e)
        {
            return e.Code;
        }
        return "NO_ERROR";
    }

    private static VeDichState StageOpen(VeDichState picked, string playerId, Power power,
        string? targetId = null, string questionId = "40-1")
        => VeDichTurn.OpenPhase2Question(
            VeDichTurn.DeclarePower(picked, playerId, power, targetId), questionId, Now);

    // ---- turn order ------------------------------------------------------------

    private static readonly List<VeDichPlayerState> OrderedPlayers =
        [Player("a", 40), Player("b", 90), Player("c", 10)];

    [Fact]
    public void TurnOrder_Phase1HighestFirst()
    {
        Assert.Equal(["b", "a", "c"],
            VeDichTurn.OrderForPhase(OrderedPlayers, 1).Select(p => p.Id));
    }

    [Fact]
    public void TurnOrder_Phase2LowestFirst()
    {
        Assert.Equal(["c", "a", "b"],
            VeDichTurn.OrderForPhase(OrderedPlayers, 2).Select(p => p.Id));
    }

    [Fact]
    public void Create_StartsInPhase1WithThatOrder()
    {
        var state = VeDichTurn.CreateVeDich(Pool, OrderedPlayers);
        Assert.Equal(1, state.Phase);
        Assert.Equal("b", state.Players[0].Id);
    }

    // ---- board composition ------------------------------------------------------

    [Fact]
    public void Board_AcceptsTheShowsBoard()
    {
        var _ = VeDichTurn.CreateVeDich(Board(), [Player("a", 0)]); // must not throw
    }

    [Fact]
    public void Board_RefusesWrongCounts()
    {
        var sixByFour = new List<VeDichQuestion>();
        foreach (var value in new[] { 20, 30, 40, 50 })
            sixByFour.AddRange(Cells(value, 6));
        Assert.Equal(24, sixByFour.Count);
        Assert.Equal("BOARD_COMPOSITION", CodeOf(() =>
            VeDichTurn.CreateVeDich(sixByFour, [Player("a", 0)])));
    }

    [Fact]
    public void Board_RefusesUnknownFaceValueAndSaysWhatItGot()
    {
        var odd = Board().Take(19).ToList();
        odd.Add(Cell(60, 1));
        var error = Assert.Throws<VeDichRuleError>(() =>
            VeDichTurn.CreateVeDich(odd, [Player("a", 0)]));
        Assert.Equal("BOARD_COMPOSITION", error.Code);
        Assert.Contains("60×1 (not a face value)", error.Message);
        Assert.Contains("50×3 (want 4)", error.Message);
    }

    // ---- phase 1 picks ----------------------------------------------------------

    [Fact]
    public void Pick1_CurrentPlayerTakesTheQuestion()
    {
        var state = VeDichTurn.CreateVeDich(Pool, [Player("a", 0), Player("b", 0)]);
        var next = VeDichTurn.PickPhase1(state, "a", "30-1");
        Assert.Equal("30-1", next.Open!.Question.Id);
        Assert.DoesNotContain(next.Remaining, q => q.Id == "30-1");
    }

    [Fact]
    public void Pick1_PicksEitherBand()
    {
        var state = VeDichTurn.CreateVeDich(Pool, [Player("a", 0)]);
        var next = VeDichTurn.PickPhase1(state, "a", "20-1");
        Assert.Equal("20-1", next.Open!.Question.Id);
    }

    [Fact]
    public void Pick1_RejectsWrongTurn()
    {
        var state = VeDichTurn.CreateVeDich(Pool, [Player("a", 90), Player("b", 0)]);
        Assert.Equal("NOT_YOUR_TURN", CodeOf(() => VeDichTurn.PickPhase1(state, "b", "50-1")));
    }

    [Fact]
    public void Pick1_RejectsPhase2Mode()
    {
        var state = VeDichTurn.CreateVeDich(Pool, [Player("a", 0)]) with { Phase = 2 };
        Assert.Equal("WRONG_PHASE", CodeOf(() => VeDichTurn.PickPhase1(state, "a", "50-1")));
    }

    [Fact]
    public void Chung_PartitionRule()
    {
        var state = VeDichTurn.CreateVeDich(Pool, [Player("a", 0)]);
        Assert.Equal(6, CountOf(state.Remaining, 20));
        Assert.Equal(6, CountOf(state.Remaining, 30));
        Assert.All(state.Remaining, q => Assert.True(q.Value is 20 or 30));
        Assert.Equal(4, CountOf(state.Deferred!, 40));
        Assert.Equal(4, CountOf(state.Deferred!, 50));
    }

    [Fact]
    public void Chung_4050NeverOpenInPhase1()
    {
        var state = VeDichTurn.CreateVeDich(Pool, [Player("a", 0)]);
        Assert.Equal("INVALID_QUESTION", CodeOf(() => VeDichTurn.PickPhase1(state, "a", "50-1")));
        Assert.Equal("INVALID_QUESTION", CodeOf(() => VeDichTurn.PickPhase1(state, "a", "40-1")));
    }

    [Fact]
    public void SummitPool_DeferredPlusUnplayedChung()
    {
        var state = VeDichTurn.BeginPhase2(VeDichTurn.CreateVeDich(Pool, [Player("a", 0)]));
        Assert.Equal(Pool.Count, state.Remaining.Count);
        Assert.Equal(4, CountOf(state.Remaining, 40));
        Assert.Equal(4, CountOf(state.Remaining, 50));
        Assert.Empty(state.Deferred!);
    }

    [Fact]
    public void Phase1Scoring()
    {
        var state = VeDichTurn.CreateVeDich(Pool, [Player("a", 0)]);
        var opened = VeDichTurn.PickPhase1(state, "a", "30-1");
        var after = VeDichTurn.ResolveQuestion(opened, new Verdicts(true, null));
        Assert.Equal(30, after.Players[0].Score);

        var opened2 = VeDichTurn.PickPhase1(state, "a", "30-1");
        var after2 = VeDichTurn.ResolveQuestion(opened2, new Verdicts(false, null));
        Assert.Equal(-15, after2.Players[0].Score);
    }

    // ---- STAR -------------------------------------------------------------------

    private static (VeDichState State, string A) RiengOpen()
    {
        var s = VeDichTurn.BeginPhase2(
            VeDichTurn.CreateVeDich(Pool, [Player("a", 0), Player("b", 0)]));
        s = VeDichTurn.PickPhase2(s, s.Players[0].Id, ["40-1", "50-1", "30-1"]);
        return (s, s.Players[0].Id);
    }

    [Fact]
    public void Star_IsRiengRuleOnly()
    {
        var chung = VeDichTurn.PickPhase1(
            VeDichTurn.CreateVeDich(Pool, [Player("a", 0)]), "a", "30-1");
        Assert.Equal("WRONG_PHASE_FOR_POWER", CodeOf(() =>
            VeDichTurn.DeclarePower(chung, "a", Power.STAR)));
    }

    [Fact]
    public void Star_OnlyCurrentPlayerMayStage()
    {
        var (state, a) = RiengOpen();
        var other = state.Players.First(p => p.Id != a).Id;
        Assert.Equal("NOT_YOUR_TURN", CodeOf(() => VeDichTurn.DeclarePower(state, other, Power.STAR)));
        Assert.Equal("NOT_YOUR_TURN", CodeOf(() =>
            VeDichTurn.DeclarePower(state, other, Power.ASSIGN, a)));
    }

    [Fact]
    public void Star_DeclaredAtOpenSpentAndNotReusable()
    {
        var (state, a) = RiengOpen();
        var withStar = StageOpen(state, a, Power.STAR);
        Assert.Equal(Power.STAR, withStar.Open!.Power);
        Assert.Equal([Power.ASSIGN], withStar.Players.First(p => p.Id == a).PowersLeft);
    }

    [Fact]
    public void Star_On40CorrectPlus60()
    {
        var (state, a) = RiengOpen();
        var s = StageOpen(state, a, Power.STAR);
        s = VeDichTurn.CloseCurrentAnswer(s, Now);
        var after = VeDichTurn.ResolveQuestion(s, new Verdicts(true, null));
        Assert.Equal(60, after.Players.First(p => p.Id == a).Score);
    }

    [Fact]
    public void Star_SpentEvenWhenWrong()
    {
        var (state, a) = RiengOpen();
        var staged = StageOpen(state, a, Power.STAR);
        var after = VeDichTurn.ResolveQuestion(
            VeDichTurn.CloseCurrentAnswer(staged, Now), new Verdicts(false, null));
        Assert.Equal(-40, after.Players.First(p => p.Id == a).Score);
        Assert.Equal([Power.ASSIGN], after.Players.First(p => p.Id == a).PowersLeft);
    }

    // ---- ASSIGN -----------------------------------------------------------------

    private static VeDichState TwoUp()
    {
        var s = VeDichTurn.BeginPhase2(
            VeDichTurn.CreateVeDich(Pool, [Player("a", 0), Player("b", 0), Player("c", 0)]));
        return VeDichTurn.PickPhase2(s, s.Players[0].Id, ["40-1", "50-1", "30-1"]);
    }

    [Fact]
    public void Assign_IsRiengOnly()
    {
        var chung = VeDichTurn.PickPhase1(
            VeDichTurn.CreateVeDich(Pool, [Player("a", 0), Player("b", 0)]), "a", "30-1");
        Assert.Equal("WRONG_PHASE_FOR_POWER", CodeOf(() =>
            VeDichTurn.DeclarePower(chung, "a", Power.ASSIGN, "b")));
    }

    [Fact]
    public void Assign_NeedsAPartner()
    {
        var s = TwoUp();
        var a = s.Players[0].Id;
        Assert.Equal("INVALID_TARGET", CodeOf(() => VeDichTurn.DeclarePower(s, a, Power.ASSIGN)));
        Assert.Equal("INVALID_TARGET", CodeOf(() => VeDichTurn.DeclarePower(s, a, Power.ASSIGN, a)));
        Assert.Equal("INVALID_TARGET", CodeOf(() =>
            VeDichTurn.DeclarePower(s, a, Power.ASSIGN, "stranger")));
    }

    [Fact]
    public void Assign_TooLateOnceOpen()
    {
        var s = TwoUp();
        var a = s.Players[0].Id;
        var opened = VeDichTurn.OpenPhase2Question(s, "40-1");
        Assert.Equal("ALREADY_OPEN", CodeOf(() => VeDichTurn.DeclarePower(opened, a, Power.STAR)));
    }

    [Fact]
    public void Assign_OpensTheDuelImmediately()
    {
        var s = TwoUp();
        var a = s.Players[0].Id;
        var b = s.Players[1].Id;
        var after = StageOpen(s, a, Power.ASSIGN, b);

        Assert.Equal(Power.ASSIGN, after.Open!.Power);
        Assert.Equal(b, after.Open!.AssignedTo);
        Assert.Equal("buzz", after.Open!.Stage);
        Assert.Equal(Now, after.BuzzOpenedAt);
        Assert.Equal([Power.STAR], after.Players.First(p => p.Id == a).PowersLeft);
    }

    [Fact]
    public void Assign_RaceRunsOnQuestionsClock()
    {
        var s = TwoUp();
        var a = s.Players[0].Id;
        var b = s.Players[1].Id;
        var after = StageOpen(s, a, Power.ASSIGN, b);
        Assert.Equal(30, VeDichTurn.BuzzWindowSeconds(after));
        Assert.True(VeDichTurn.IsBuzzOpen(after, At(20)));
        Assert.False(VeDichTurn.IsBuzzOpen(after, At(31)));
    }

    [Fact]
    public void Assign_OnlyTheTwoHalvesMayBuzz()
    {
        var s = TwoUp();
        var a = s.Players[0].Id;
        var b = s.Players[1].Id;
        var outsider = s.Players[2].Id;
        var after = StageOpen(s, a, Power.ASSIGN, b);

        Assert.Equal("NOT_YOUR_TURN", CodeOf(() => VeDichTurn.Buzz(after, outsider, At(1))));
        Assert.Equal("NO_ERROR", CodeOf(() => VeDichTurn.Buzz(after, a, At(1))));
        Assert.Equal("NO_ERROR", CodeOf(() => VeDichTurn.Buzz(after, b, At(1))));
    }

    [Fact]
    public void Assign_FirstBuzzLocksTheOther()
    {
        var s = TwoUp();
        var a = s.Players[0].Id;
        var b = s.Players[1].Id;
        var racing = StageOpen(s, a, Power.ASSIGN, b);

        var afterA = VeDichTurn.Buzz(racing, a, At(1));
        Assert.Equal(a, afterA.Open!.Buzzer);
        Assert.Equal("ALREADY_OPEN", CodeOf(() => VeDichTurn.Buzz(afterA, b, At(2))));

        var afterB = VeDichTurn.Buzz(racing, b, At(1));
        Assert.Equal(b, afterB.Open!.Buzzer);
        Assert.Equal("ALREADY_OPEN", CodeOf(() => VeDichTurn.Buzz(afterB, a, At(2))));
    }

    [Fact]
    public void Assign_BuzzRight_APays()
    {
        var s = TwoUp();
        var a = s.Players[0].Id;
        var b = s.Players[1].Id;
        var after = StageOpen(s, a, Power.ASSIGN, b);
        after = VeDichTurn.Buzz(after, a, At(2));
        after = VeDichTurn.ResolveQuestion(after, new Verdicts(true, true));

        Assert.Equal(40, after.Players.First(p => p.Id == a).Score);
        Assert.Equal(-20, after.Players.First(p => p.Id == b).Score);
        Assert.Null(after.Open);
    }

    [Fact]
    public void Assign_BuzzWrong()
    {
        var s = TwoUp();
        var a = s.Players[0].Id;
        var b = s.Players[1].Id;
        var after = StageOpen(s, a, Power.ASSIGN, b);
        after = VeDichTurn.Buzz(after, a, At(2));
        after = VeDichTurn.ResolveQuestion(after, new Verdicts(false, false));

        Assert.Equal(-20, after.Players.First(p => p.Id == a).Score);
        Assert.Equal(0, after.Players.First(p => p.Id == b).Score);
    }

    [Fact]
    public void Assign_BBuzzesRight_PairingFollowsBuzzer()
    {
        var s = TwoUp();
        var a = s.Players[0].Id;
        var b = s.Players[1].Id;
        var after = StageOpen(s, a, Power.ASSIGN, b);
        after = VeDichTurn.Buzz(after, b, At(2));
        after = VeDichTurn.ResolveQuestion(after, new Verdicts(false, true));

        Assert.Equal(-20, after.Players.First(p => p.Id == a).Score);
        Assert.Equal(40, after.Players.First(p => p.Id == b).Score);
    }

    [Fact]
    public void Assign_NobodyBuzzes_BothLoseHalf()
    {
        var s = TwoUp();
        var a = s.Players[0].Id;
        var b = s.Players[1].Id;
        var after = StageOpen(s, a, Power.ASSIGN, b);
        after = VeDichTurn.ResolveQuestion(after, new Verdicts(false, null));

        Assert.Equal(-20, after.Players.First(p => p.Id == a).Score);
        Assert.Equal(-20, after.Players.First(p => p.Id == b).Score);
    }

    [Fact]
    public void Assign_OperatorCanLockTheRace()
    {
        var s = TwoUp();
        var a = s.Players[0].Id;
        var b = s.Players[1].Id;
        var racing = StageOpen(s, a, Power.ASSIGN, b);

        Assert.True(VeDichTurn.IsBuzzOpen(racing, At(1)));
        var locked = VeDichTurn.LockBuzzWindow(racing);

        Assert.False(VeDichTurn.IsBuzzOpen(locked, At(1)));
        Assert.Equal("WINDOW_CLOSED", CodeOf(() => VeDichTurn.Buzz(locked, a, At(2))));
        Assert.Equal("WINDOW_CLOSED", CodeOf(() => VeDichTurn.Buzz(locked, b, At(2))));
    }

    [Fact]
    public void Assign_LockedRaceResolvesAsNobodyBuzzed()
    {
        var s = TwoUp();
        var a = s.Players[0].Id;
        var b = s.Players[1].Id;
        var locked = VeDichTurn.LockBuzzWindow(StageOpen(s, a, Power.ASSIGN, b));
        var after = VeDichTurn.ResolveQuestion(locked, new Verdicts(false, null));

        Assert.Equal(-20, after.Players.First(p => p.Id == a).Score);
        Assert.Equal(-20, after.Players.First(p => p.Id == b).Score);
        Assert.Null(after.Open);
    }

    [Fact]
    public void Assign_LockCannotStealSettledRaceOrFireWithNothingOpen()
    {
        var s = TwoUp();
        var a = s.Players[0].Id;
        var b = s.Players[1].Id;
        var racing = StageOpen(s, a, Power.ASSIGN, b);

        Assert.Equal("ALREADY_OPEN", CodeOf(() =>
            VeDichTurn.LockBuzzWindow(VeDichTurn.Buzz(racing, a, At(1)))));
        Assert.Equal("NOTHING_OPEN", CodeOf(() =>
            VeDichTurn.LockBuzzWindow(VeDichTurn.CreateVeDich(Pool, [Player("a", 0)]))));
    }

    [Fact]
    public void Assign_FreshQuestionStartsUnlocked()
    {
        var s = TwoUp();
        var a = s.Players[0].Id;
        var locked = VeDichTurn.LockBuzzWindow(
            VeDichTurn.CloseCurrentAnswer(VeDichTurn.OpenPhase2Question(s, "40-1"), Now));
        var nextTurn = VeDichTurn.AdvanceTurn(
            VeDichTurn.ResolveQuestion(locked, new Verdicts(true, null)));
        Assert.False(nextTurn.BuzzLocked == true);
    }

    [Fact]
    public void Assign_BuzzAfterQuestionsClockRefused()
    {
        var s = TwoUp();
        var a = s.Players[0].Id;
        var b = s.Players[1].Id;
        var after = StageOpen(s, a, Power.ASSIGN, b);
        Assert.Equal("WINDOW_CLOSED", CodeOf(() => VeDichTurn.Buzz(after, b, At(31))));
    }

    // ---- phase 2 flow ------------------------------------------------------------

    private static VeDichState Picked3()
        => VeDichTurn.PickPhase2(
            VeDichTurn.BeginPhase2(VeDichTurn.CreateVeDich(Pool, OrderedPlayers)),
            "c", ["50-1", "40-1", "30-1"]);

    [Fact]
    public void Phase2_ExactlyThreeDistinctPicks()
    {
        var state = VeDichTurn.BeginPhase2(VeDichTurn.CreateVeDich(Pool, OrderedPlayers));
        Assert.Equal("INVALID_QUESTION", CodeOf(() =>
            VeDichTurn.PickPhase2(state, "c", ["50-1", "40-1"])));
        Assert.Equal("INVALID_QUESTION", CodeOf(() =>
            VeDichTurn.PickPhase2(state, "c", ["50-1", "50-1", "40-1"])));
        Assert.Equal("NO_ERROR", CodeOf(() =>
            VeDichTurn.PickPhase2(state, "c", ["50-1", "40-1", "30-1"])));
    }

    [Fact]
    public void Phase2_BuzzWindowOpensAfterCurrentAnswer()
    {
        var state = Picked3();
        state = VeDichTurn.OpenPhase2Question(state, "50-1");
        state = VeDichTurn.CloseCurrentAnswer(state, Now);
        Assert.Equal("buzz", state.Open!.Stage);
    }

    [Fact]
    public void Phase2_FastestBuzzerAnswers()
    {
        var state = Picked3();
        state = VeDichTurn.CloseCurrentAnswer(VeDichTurn.OpenPhase2Question(state, "50-1"), Now);
        state = VeDichTurn.Buzz(state, "a", Now);
        Assert.Equal("a", state.Open!.Buzzer);
        Assert.Equal("ALREADY_OPEN", CodeOf(() => VeDichTurn.Buzz(state, "b", Now)));
    }

    [Fact]
    public void Phase2_CurrentPlayerCannotBuzzOwnQuestion()
    {
        var state = Picked3();
        state = VeDichTurn.CloseCurrentAnswer(VeDichTurn.OpenPhase2Question(state, "50-1"), Now);
        Assert.Equal("NOT_YOUR_TURN", CodeOf(() => VeDichTurn.Buzz(state, "c", Now)));
    }

    [Fact]
    public void Phase2_NoBuzzBeforeWindow()
    {
        var state = Picked3();
        state = VeDichTurn.OpenPhase2Question(state, "50-1");
        Assert.Equal("ALREADY_OPEN", CodeOf(() => VeDichTurn.Buzz(state, "a", Now)));
    }

    [Fact]
    public void Phase2_CannotResolveBeforeBuzzWindow()
    {
        var state = Picked3();
        state = VeDichTurn.OpenPhase2Question(state, "50-1");
        Assert.Equal("ALREADY_OPEN", CodeOf(() =>
            VeDichTurn.ResolveQuestion(state, new Verdicts(true, null))));
    }

    [Fact]
    public void Phase2_BothCorrectPayFaceValue()
    {
        var state = Picked3();
        state = VeDichTurn.Buzz(
            VeDichTurn.CloseCurrentAnswer(VeDichTurn.OpenPhase2Question(state, "50-1"), Now), "a", Now);
        state = VeDichTurn.ResolveQuestion(state, new Verdicts(true, true));
        Assert.Equal(60, state.Players.First(p => p.Id == "c").Score);
        Assert.Equal(90, state.Players.First(p => p.Id == "a").Score);
    }

    [Fact]
    public void Phase2_CurrentWrongBuzzerRight()
    {
        var state = Picked3();
        state = VeDichTurn.Buzz(
            VeDichTurn.CloseCurrentAnswer(VeDichTurn.OpenPhase2Question(state, "50-1"), Now), "a", Now);
        state = VeDichTurn.ResolveQuestion(state, new Verdicts(false, true));
        Assert.Equal(-15, state.Players.First(p => p.Id == "c").Score);
        Assert.Equal(90, state.Players.First(p => p.Id == "a").Score);
    }

    [Fact]
    public void Phase2_NoBuzzCurrentCorrectScoresOnce()
    {
        var state = Picked3();
        state = VeDichTurn.ResolveQuestion(
            VeDichTurn.CloseCurrentAnswer(VeDichTurn.OpenPhase2Question(state, "50-1"), Now),
            new Verdicts(true, null));
        Assert.Equal(60, state.Players.First(p => p.Id == "c").Score);
    }

    [Fact]
    public void Phase2_BuzzerVerdictRequiredWhenBuzzedForbiddenWhenNot()
    {
        var withBuzz = Picked3();
        var buzzing = VeDichTurn.Buzz(
            VeDichTurn.CloseCurrentAnswer(VeDichTurn.OpenPhase2Question(withBuzz, "50-1"), Now), "a", Now);
        Assert.Equal("NOT_YOUR_TURN", CodeOf(() =>
            VeDichTurn.ResolveQuestion(buzzing, new Verdicts(true, null))));

        var noBuzz = Picked3();
        noBuzz = VeDichTurn.CloseCurrentAnswer(VeDichTurn.OpenPhase2Question(noBuzz, "50-1"), Now);
        Assert.Equal("NOT_YOUR_TURN", CodeOf(() =>
            VeDichTurn.ResolveQuestion(noBuzz, new Verdicts(true, true))));
    }

    [Fact]
    public void Phase2_NoDeclarationMidQuestion()
    {
        var state = Picked3();
        state = VeDichTurn.OpenPhase2Question(state, "50-1");
        state = VeDichTurn.CloseCurrentAnswer(state, Now);
        state = VeDichTurn.Buzz(state, "a", Now);
        Assert.Equal("ALREADY_OPEN", CodeOf(() => VeDichTurn.DeclarePower(state, "a", Power.STAR)));
        Assert.Equal("ALREADY_OPEN", CodeOf(() => VeDichTurn.DeclarePower(state, "c", Power.STAR)));
    }

    [Fact]
    public void Phase2_AdvanceTurnClearsPendingPicks()
    {
        var state = Picked3();
        state = VeDichTurn.ResolveQuestion(
            VeDichTurn.CloseCurrentAnswer(VeDichTurn.OpenPhase2Question(state, "50-1"), Now),
            new Verdicts(true, null));
        var next = VeDichTurn.AdvanceTurn(state);
        Assert.Equal(1, next.TurnIndex);
        Assert.Empty(next.PendingPicks);
    }

    // ---- phase transitions ---------------------------------------------------------

    [Fact]
    public void Transitions_Phase1NotCompleteUntilEveryPlayerPlayed()
    {
        var s = VeDichTurn.CreateVeDich(Pool, OrderedPlayers);
        Assert.False(VeDichTurn.Phase1Complete(s));
        s = VeDichTurn.AdvanceTurn(s);
        s = VeDichTurn.AdvanceTurn(s);
        Assert.False(VeDichTurn.Phase1Complete(s));
        s = VeDichTurn.AdvanceTurn(s);
        Assert.True(VeDichTurn.Phase1Complete(s));
    }

    [Fact]
    public void Transitions_OpenQuestionBlocksCompletion()
    {
        var done = Phase1Done();
        var withOpen = done with
        {
            Open = new OpenQuestion
            {
                Question = done.Remaining[0],
                Answerer = "b",
                Power = null,
                Stage = "current",
                Buzzer = null
            }
        };
        Assert.False(VeDichTurn.Phase1Complete(withOpen));
    }

    [Fact]
    public void Transitions_BeginPhase2Reorders()
    {
        var s = VeDichTurn.BeginPhase2(Phase1Done());
        Assert.Equal(2, s.Phase);
        Assert.Equal(["c", "a", "b"], s.Players.Select(p => p.Id));
        Assert.Equal(0, s.TurnIndex);
        Assert.Empty(s.PendingPicks);
    }

    [Fact]
    public void Transitions_BeginPhase2SkipsUntouchedButRefusesTouched()
    {
        Assert.Equal(2, VeDichTurn.BeginPhase2(VeDichTurn.CreateVeDich(Pool, OrderedPlayers)).Phase);
        Assert.Equal("PHASE1_INCOMPLETE", CodeOf(() =>
            VeDichTurn.BeginPhase2(VeDichTurn.AdvanceTurn(VeDichTurn.CreateVeDich(Pool, OrderedPlayers)))));
    }

    [Fact]
    public void Transitions_BeginPhase2CannotRunTwice()
    {
        var s = VeDichTurn.BeginPhase2(Phase1Done());
        Assert.Equal("WRONG_PHASE", CodeOf(() => VeDichTurn.BeginPhase2(s)));
    }

    [Fact]
    public void Transitions_Phase2CompletesAfterEveryTurn()
    {
        var s = VeDichTurn.BeginPhase2(Phase1Done());
        Assert.False(VeDichTurn.Phase2Complete(s));
        for (var i = 0; i < OrderedPlayers.Count; i++)
            s = VeDichTurn.AdvanceTurn(s);
        Assert.True(VeDichTurn.Phase2Complete(s));
    }

    [Fact]
    public void Transitions_EndVeDichClearsOpenQuestion()
    {
        var s = VeDichTurn.CreateVeDich(Pool, [Player("a", 0)]);
        s = VeDichTurn.PickPhase1(s, "a", "30-1");
        var ended = VeDichTurn.EndVeDich(s);
        Assert.True(ended.Ended);
        Assert.Null(ended.Open);
    }

    private static VeDichState Phase1Done()
    {
        var s = VeDichTurn.CreateVeDich(Pool, OrderedPlayers);
        for (var i = 0; i < OrderedPlayers.Count; i++)
            s = VeDichTurn.AdvanceTurn(s);
        return s;
    }

    // ---- the 5 s buzz window ---------------------------------------------------------

    private static VeDichState Buzzing()
    {
        var s = VeDichTurn.BeginPhase2(VeDichTurn.CreateVeDich(Pool, OrderedPlayers));
        s = VeDichTurn.PickPhase2(s, "c", ["50-1", "40-1", "30-1"]);
        s = VeDichTurn.OpenPhase2Question(s, "50-1");
        return VeDichTurn.CloseCurrentAnswer(s, Now);
    }

    [Fact]
    public void Window5s_ClosedBeforeCurrentAnswerClosed()
    {
        var state = VeDichTurn.OpenPhase2Question(
            VeDichTurn.PickPhase2(
                VeDichTurn.BeginPhase2(VeDichTurn.CreateVeDich(Pool, OrderedPlayers)),
                "c", ["50-1", "40-1", "30-1"]),
            "50-1");
        Assert.False(VeDichTurn.IsBuzzOpen(state, Now));
    }

    [Fact]
    public void Window5s_OpenForExactlyFiveSeconds()
    {
        var s = Buzzing();
        Assert.True(VeDichTurn.IsBuzzOpen(s, Now));
        Assert.True(VeDichTurn.IsBuzzOpen(s, At(5)));
        Assert.False(VeDichTurn.IsBuzzOpen(s, At(5.001)));
    }

    [Fact]
    public void Window5s_ClosedInPhase1()
    {
        Assert.False(VeDichTurn.IsBuzzOpen(VeDichTurn.CreateVeDich(Pool, OrderedPlayers), Now));
    }

    [Fact]
    public void Window5s_ResolvingClosesIt()
    {
        var s = VeDichTurn.ResolveQuestion(Buzzing(), new Verdicts(true, null));
        Assert.False(VeDichTurn.IsBuzzOpen(s, Now));
    }

    // ---- powers staged on the pick board ------------------------------------------------

    [Fact]
    public void Staged_StarStagedWithoutSpendingOpenSpendsIt()
    {
        var (state, a) = RiengOpen();
        var staged = VeDichTurn.DeclarePower(state, a, Power.STAR);
        Assert.Equal(Power.STAR, staged.StagedPower!.Power);
        Assert.Equal([Power.STAR, Power.ASSIGN], staged.Players.First(p => p.Id == a).PowersLeft);

        var opened = VeDichTurn.OpenPhase2Question(staged, "40-1", Now);
        Assert.Equal(Power.STAR, opened.Open!.Power);
        Assert.Null(opened.StagedPower);
        Assert.Equal([Power.ASSIGN], opened.Players.First(p => p.Id == a).PowersLeft);
    }

    [Fact]
    public void Staged_NoneIsNotAPick()
    {
        var (state, a, b) = RiengStaged();
        var none = VeDichTurn.DeclarePower(state, a, null);
        Assert.Null(none.StagedPower);
        Assert.NotEqual(true, none.TurnPowerUsed);
        Assert.Equal([Power.STAR, Power.ASSIGN], none.Players.First(p => p.Id == a).PowersLeft);

        var star = VeDichTurn.DeclarePower(none, a, Power.STAR);
        Assert.Equal(Power.STAR, star.StagedPower!.Power);
        Assert.Equal(true, star.TurnPowerUsed);

        Assert.Equal("ONE_POWER_PER_TURN", CodeOf(() =>
            VeDichTurn.DeclarePower(star, a, Power.ASSIGN, b)));

        var opened = VeDichTurn.OpenPhase2Question(star, "40-1", Now);
        Assert.Equal(Power.STAR, opened.Open!.Power);
        Assert.Equal([Power.ASSIGN], opened.Players.First(p => p.Id == a).PowersLeft);
    }

    private static (VeDichState State, string A, string B) RiengStaged()
    {
        var s = VeDichTurn.BeginPhase2(
            VeDichTurn.CreateVeDich(Pool, [Player("a", 0), Player("b", 0)]));
        s = VeDichTurn.PickPhase2(s, s.Players[0].Id, ["40-1", "50-1", "30-1"]);
        return (s, s.Players[0].Id, s.Players[1].Id);
    }

    [Fact]
    public void Staged_OnlyCurrentPlayerAfterPicks()
    {
        var (state, a, b) = RiengStaged();
        Assert.Equal("NOT_YOUR_TURN", CodeOf(() => VeDichTurn.DeclarePower(state, b, Power.STAR)));

        var bare = VeDichTurn.BeginPhase2(
            VeDichTurn.CreateVeDich(Pool, [Player("a", 0), Player("b", 0)]));
        Assert.Equal("NOTHING_OPEN", CodeOf(() => VeDichTurn.DeclarePower(bare, a, Power.STAR)));
    }

    [Fact]
    public void Staged_OnePowerPerTurn()
    {
        var (state, a, b) = RiengStaged();
        var star = VeDichTurn.DeclarePower(state, a, Power.STAR);
        Assert.Equal(true, star.TurnPowerUsed);

        Assert.Equal("ONE_POWER_PER_TURN", CodeOf(() =>
            VeDichTurn.DeclarePower(star, a, Power.ASSIGN, b)));
        var afterNone = VeDichTurn.DeclarePower(star, a, null);
        Assert.Equal(Power.STAR, afterNone.StagedPower!.Power);
        Assert.Equal(true, afterNone.TurnPowerUsed);
        Assert.Equal(Power.STAR, star.StagedPower!.Power);
    }

    [Fact]
    public void Staged_AssignOpensTheRace()
    {
        var (state, a, b) = RiengStaged();
        var staged = VeDichTurn.DeclarePower(state, a, Power.ASSIGN, b);
        var opened = VeDichTurn.OpenPhase2Question(staged, "40-1", At(5));
        Assert.Equal("buzz", opened.Open!.Stage);
        Assert.Equal(Power.ASSIGN, opened.Open!.Power);
        Assert.Equal(b, opened.Open!.AssignedTo);
        Assert.Equal(At(5), opened.BuzzOpenedAt);
        Assert.Equal([Power.STAR], opened.Players.First(p => p.Id == a).PowersLeft);
    }

    [Fact]
    public void Staged_AbandoningTurnClearsUnspent()
    {
        var (state, a) = RiengOpen();
        var moved = VeDichTurn.AdvanceTurn(VeDichTurn.DeclarePower(state, a, Power.STAR));
        Assert.Null(moved.StagedPower);
        Assert.NotEqual(true, moved.TurnPowerUsed);
        Assert.Equal([Power.STAR, Power.ASSIGN], moved.Players.First(p => p.Id == a).PowersLeft);
    }

    [Fact]
    public void Staged_RefusesSpentPower()
    {
        var (state, a) = RiengOpen();
        var spent = state with
        {
            Players = state.Players.Select(p =>
                p.Id == a ? p with { PowersLeft = [Power.ASSIGN] } : p).ToList()
        };
        Assert.Equal("POWER_UNAVAILABLE", CodeOf(() =>
            VeDichTurn.DeclarePower(spent, a, Power.STAR)));
    }

    [Fact]
    public void Staged_TurnCapSurvivesOpenAndResolve()
    {
        var (state, a, b) = RiengStaged();
        var s = VeDichTurn.OpenPhase2Question(
            VeDichTurn.DeclarePower(state, a, Power.STAR), "40-1", Now);
        s = VeDichTurn.ResolveQuestion(
            VeDichTurn.CloseCurrentAnswer(s, Now), new Verdicts(true, null));

        Assert.True(s.PendingPicks.Count > 0);
        Assert.Equal("ONE_POWER_PER_TURN", CodeOf(() =>
            VeDichTurn.DeclarePower(s, a, Power.ASSIGN, b)));
        Assert.Equal("NO_ERROR", CodeOf(() => VeDichTurn.DeclarePower(s, a, null)));
        Assert.Equal([Power.ASSIGN], s.Players.First(p => p.Id == a).PowersLeft);
    }

    [Fact]
    public void Staged_AdvanceTurnLiftsTheCap()
    {
        var (state, a) = RiengOpen();
        var s = VeDichTurn.OpenPhase2Question(
            VeDichTurn.DeclarePower(state, a, Power.STAR), "40-1", Now);
        s = VeDichTurn.ResolveQuestion(
            VeDichTurn.CloseCurrentAnswer(s, Now), new Verdicts(true, null));
        s = VeDichTurn.AdvanceTurn(s);
        Assert.Equal(false, s.TurnPowerUsed);
        Assert.Null(s.StagedPower);

        var next = s.Players[s.TurnIndex].Id;
        s = VeDichTurn.PickPhase2(s, next, s.Remaining.Take(3).Select(q => q.Id).ToList());
        var partner = s.Players.First(p => p.Id != next).Id;
        Assert.Equal("NO_ERROR", CodeOf(() =>
            VeDichTurn.DeclarePower(s, next, Power.ASSIGN, partner)));
    }
}
