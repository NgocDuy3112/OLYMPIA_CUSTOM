using AOC.Domain.Contracts;
using AOC.Domain.Gameplay;
using AOC.Domain.Gameplay.Turns;
using Xunit;

namespace AOC.Tests.Engine;

public partial class VeDichTurnTests
{
    [Fact]
    public void Star_IsRiengRuleOnly()
    {
        var chung = VeDichTurn.PickPhase1(
            VeDichTurn.CreateVeDich(Pool, [Player("a", 0)]), "a", "30-1");
        Assert.Equal("WRONG_PHASE_FOR_POWER", CodeOf(() =>
            VeDichTurn.DeclarePower(chung, "a", PowerKind.STAR)));
    }

    [Fact]
    public void Star_OnlyCurrentPlayerMayStage()
    {
        var (state, a) = RiengOpen();
        var other = state.Players.First(p => p.Id != a).Id;
        Assert.Equal("NOT_YOUR_TURN", CodeOf(() => VeDichTurn.DeclarePower(state, other, PowerKind.STAR)));
        Assert.Equal("NOT_YOUR_TURN", CodeOf(() =>
            VeDichTurn.DeclarePower(state, other, PowerKind.ASSIGN, a)));
    }

    [Fact]
    public void Star_DeclaredAtOpenSpentAndNotReusable()
    {
        var (state, a) = RiengOpen();
        var withStar = StageOpen(state, a, PowerKind.STAR);
        Assert.Equal(PowerKind.STAR, withStar.Open!.Power);
        Assert.Empty(withStar.Players.First(p => p.Id == a).Powers.Available);
    }

    [Fact]
    public void Star_On40CorrectPlus60()
    {
        var (state, a) = RiengOpen();
        var s = StageOpen(state, a, PowerKind.STAR);
        s = VeDichTurn.CloseCurrentAnswer(s, Now);
        var after = VeDichTurn.ResolveQuestion(s, new Verdicts(true, null));
        Assert.Equal(60, after.Players.First(p => p.Id == a).Score);
    }

    [Fact]
    public void Star_SpentEvenWhenWrong()
    {
        var (state, a) = RiengOpen();
        var staged = StageOpen(state, a, PowerKind.STAR);
        var after = VeDichTurn.ResolveQuestion(
            VeDichTurn.CloseCurrentAnswer(staged, Now), new Verdicts(false, null));
        Assert.Equal(-40, after.Players.First(p => p.Id == a).Score);
        Assert.Empty(after.Players.First(p => p.Id == a).Powers.Available);
    }

    [Fact]
    public void Assign_IsRiengOnly()
    {
        var chung = VeDichTurn.PickPhase1(
            VeDichTurn.CreateVeDich(Pool, [Player("a", 0), Player("b", 0)]), "a", "30-1");
        Assert.Equal("WRONG_PHASE_FOR_POWER", CodeOf(() =>
            VeDichTurn.DeclarePower(chung, "a", PowerKind.ASSIGN, "b")));
    }

    [Fact]
    public void Assign_NeedsAPartner()
    {
        var s = TwoUp();
        var a = s.Players[0].Id;
        Assert.Equal("INVALID_TARGET", CodeOf(() => VeDichTurn.DeclarePower(s, a, PowerKind.ASSIGN)));
        Assert.Equal("INVALID_TARGET", CodeOf(() => VeDichTurn.DeclarePower(s, a, PowerKind.ASSIGN, a)));
        Assert.Equal("INVALID_TARGET", CodeOf(() =>
            VeDichTurn.DeclarePower(s, a, PowerKind.ASSIGN, "stranger")));
    }

    [Fact]
    public void Assign_DeclaringAfterTheOpenIsRefused()
    {
        var s = TwoUp();
        var a = s.Players[0].Id;
        var b = s.Players[1].Id;
        var opened = VeDichTurn.OpenPhase2Question(s, "40-1");

        Assert.Equal("ALREADY_OPEN", CodeOf(() => VeDichTurn.DeclarePower(opened, a, PowerKind.STAR)));
        Assert.Equal("ALREADY_OPEN", CodeOf(() => VeDichTurn.DeclarePower(opened, a, PowerKind.ASSIGN, b)));
    }

    [Fact]
    public void Assign_StagedPowerSurvivesTheOpen()
    {
        var s = TwoUp();
        var a = s.Players[0].Id;
        var b = s.Players[1].Id;
        var powered = VeDichTurn.OpenPhase2Question(
            VeDichTurn.DeclarePower(s, a, PowerKind.ASSIGN, b), "40-1", Now);

        Assert.Equal(PowerKind.ASSIGN, powered.Open!.Power);
        Assert.True(powered.Players[powered.TurnIndex].Powers.UsedThisTurn);
        Assert.Empty(powered.Players.First(p => p.Id == a).Powers.Available);
    }

    [Fact]
    public void Assign_OpensTheDuelImmediately()
    {
        var s = TwoUp();
        var a = s.Players[0].Id;
        var b = s.Players[1].Id;
        var after = StageOpen(s, a, PowerKind.ASSIGN, b);

        Assert.Equal(PowerKind.ASSIGN, after.Open!.Power);
        Assert.Equal(b, after.Open!.Window.PairB);
        Assert.Equal(AnswerMode.Buzz, after.Open!.Window.Mode);
        Assert.Equal(Now, after.Open!.Window.OpenedAt);
        Assert.Empty(after.Players.First(p => p.Id == a).Powers.Available);
    }

    [Fact]
    public void Assign_RaceRunsOnQuestionsClock()
    {
        var s = TwoUp();
        var a = s.Players[0].Id;
        var b = s.Players[1].Id;
        var after = StageOpen(s, a, PowerKind.ASSIGN, b);
        Assert.Equal(30, VeDichTurn.BuzzWindowSeconds(after));
        Assert.True(VeDichTurn.IsBuzzOpen(after, At(20)));
        Assert.False(VeDichTurn.IsBuzzOpen(after, At(31)));
    }

    [Fact]
    public void Assign_RaceWindowComesFromTheBucketBand()
    {
        var s = TwoUp();
        var a = s.Players[0].Id;
        var b = s.Players[1].Id;

        Assert.Equal(20, VeDichTurn.BuzzWindowSeconds(StageOpen(s, a, PowerKind.ASSIGN, b, "30-1")));
        Assert.Equal(30, VeDichTurn.BuzzWindowSeconds(StageOpen(s, a, PowerKind.ASSIGN, b, "40-1")));
        Assert.Equal(45, VeDichTurn.BuzzWindowSeconds(StageOpen(s, a, PowerKind.ASSIGN, b, "50-1")));
    }

    [Fact]
    public void Assign_OnlyTheTwoHalvesMayBuzz()
    {
        var s = TwoUp();
        var a = s.Players[0].Id;
        var b = s.Players[1].Id;
        var outsider = s.Players[2].Id;
        var after = StageOpen(s, a, PowerKind.ASSIGN, b);

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
        var racing = StageOpen(s, a, PowerKind.ASSIGN, b);

        var afterA = VeDichTurn.Buzz(racing, a, At(1));
        Assert.Equal(a, afterA.Open!.Window.Buzzer);
        Assert.Equal("ALREADY_OPEN", CodeOf(() => VeDichTurn.Buzz(afterA, b, At(2))));

        var afterB = VeDichTurn.Buzz(racing, b, At(1));
        Assert.Equal(b, afterB.Open!.Window.Buzzer);
        Assert.Equal("ALREADY_OPEN", CodeOf(() => VeDichTurn.Buzz(afterB, a, At(2))));
    }

    [Fact]
    public void Assign_BuzzRight_APays()
    {
        var s = TwoUp();
        var a = s.Players[0].Id;
        var b = s.Players[1].Id;
        var after = StageOpen(s, a, PowerKind.ASSIGN, b);
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
        var after = StageOpen(s, a, PowerKind.ASSIGN, b);
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
        var after = StageOpen(s, a, PowerKind.ASSIGN, b);
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
        var after = StageOpen(s, a, PowerKind.ASSIGN, b);
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
        var racing = StageOpen(s, a, PowerKind.ASSIGN, b);

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
        var locked = VeDichTurn.LockBuzzWindow(StageOpen(s, a, PowerKind.ASSIGN, b));
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
        var racing = StageOpen(s, a, PowerKind.ASSIGN, b);

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
        var nextTurn = VeDichTurn.ResolveQuestion(locked, new Verdicts(true, null));
        var fresh = VeDichTurn.OpenPhase2Question(nextTurn, "50-1");
        Assert.False(fresh.Open!.Window.Locked);
    }

    [Fact]
    public void Assign_BuzzAfterQuestionsClockRefused()
    {
        var s = TwoUp();
        var a = s.Players[0].Id;
        var b = s.Players[1].Id;
        var after = StageOpen(s, a, PowerKind.ASSIGN, b);
        Assert.Equal("WINDOW_CLOSED", CodeOf(() => VeDichTurn.Buzz(after, b, At(31))));
    }

    [Fact]
    public void Staged_StarStagedWithoutSpendingOpenSpendsIt()
    {
        var (state, a) = RiengOpen();
        var staged = VeDichTurn.DeclarePower(state, a, PowerKind.STAR);
        Assert.Equal(PowerKind.STAR, staged.Players[staged.TurnIndex].Powers.Staged!.Power);
        Assert.Equal([PowerKind.STAR, PowerKind.ASSIGN], staged.Players.First(p => p.Id == a).Powers.Available);

        var opened = VeDichTurn.OpenPhase2Question(staged, "40-1", Now);
        Assert.Equal(PowerKind.STAR, opened.Open!.Power);
        Assert.Null(opened.Players[opened.TurnIndex].Powers.Staged);
        Assert.Empty(opened.Players.First(p => p.Id == a).Powers.Available);
    }

    [Fact]
    public void Staged_NoneIsNotAPick()
    {
        var (state, a, b) = RiengStaged();
        var none = VeDichTurn.DeclarePower(state, a, null);
        Assert.Null(none.Players[none.TurnIndex].Powers.Staged);
        Assert.NotEqual(true, none.Players[none.TurnIndex].Powers.UsedThisTurn);
        Assert.Equal([PowerKind.STAR, PowerKind.ASSIGN], none.Players.First(p => p.Id == a).Powers.Available);

        var star = VeDichTurn.DeclarePower(none, a, PowerKind.STAR);
        Assert.Equal(PowerKind.STAR, star.Players[star.TurnIndex].Powers.Staged!.Power);
        Assert.Equal(true, star.Players[star.TurnIndex].Powers.UsedThisTurn);

        Assert.Equal("ONE_POWER_PER_TURN", CodeOf(() =>
            VeDichTurn.DeclarePower(star, a, PowerKind.ASSIGN, b)));

        var opened = VeDichTurn.OpenPhase2Question(star, "40-1", Now);
        Assert.Equal(PowerKind.STAR, opened.Open!.Power);
        Assert.Empty(opened.Players.First(p => p.Id == a).Powers.Available);
    }

    [Fact]
    public void Staged_OnlyCurrentPlayerAfterPicks()
    {
        var (state, a, b) = RiengStaged();
        Assert.Equal("NOT_YOUR_TURN", CodeOf(() => VeDichTurn.DeclarePower(state, b, PowerKind.STAR)));

        var bare = VeDichTurn.BeginPhase2(
            VeDichTurn.CreateVeDich(Pool, [Player("a", 0), Player("b", 0)]));
        Assert.Equal("NOTHING_OPEN", CodeOf(() => VeDichTurn.DeclarePower(bare, a, PowerKind.STAR)));
    }

    [Fact]
    public void Staged_OnePowerPerTurn()
    {
        var (state, a, b) = RiengStaged();
        var star = VeDichTurn.DeclarePower(state, a, PowerKind.STAR);
        Assert.Equal(true, star.Players[star.TurnIndex].Powers.UsedThisTurn);

        Assert.Equal("ONE_POWER_PER_TURN", CodeOf(() =>
            VeDichTurn.DeclarePower(star, a, PowerKind.ASSIGN, b)));
        var afterNone = VeDichTurn.DeclarePower(star, a, null);
        Assert.Null(afterNone.Players[afterNone.TurnIndex].Powers.Staged);
        Assert.False(afterNone.Players[afterNone.TurnIndex].Powers.UsedThisTurn);
        Assert.Equal([PowerKind.STAR, PowerKind.ASSIGN], afterNone.Players.First(p => p.Id == a).Powers.Available);
        Assert.Equal(PowerKind.STAR, star.Players[star.TurnIndex].Powers.Staged!.Power);
    }

    [Fact]
    public void Staged_AssignOpensTheRace()
    {
        var (state, a, b) = RiengStaged();
        var staged = VeDichTurn.DeclarePower(state, a, PowerKind.ASSIGN, b);
        var opened = VeDichTurn.RevealQuestion(
            VeDichTurn.OpenPhase2Question(staged, "40-1", At(5)), At(5));
        Assert.Equal(AnswerMode.Buzz, opened.Open!.Window.Mode);
        Assert.Equal(PowerKind.ASSIGN, opened.Open!.Power);
        Assert.Equal(b, opened.Open!.Window.PairB);
        Assert.Equal(At(5), opened.Open!.Window.OpenedAt);
        Assert.Empty(opened.Players.First(p => p.Id == a).Powers.Available);
    }

    [Fact]
    public void Staged_AbandoningTurnClearsUnspent()
    {
        var (state, a) = RiengOpen();
        var moved = VeDichTurn.AdvanceTurn(VeDichTurn.DeclarePower(state, a, PowerKind.STAR));
        Assert.Null(moved.Players[moved.TurnIndex].Powers.Staged);
        Assert.NotEqual(true, moved.Players[moved.TurnIndex].Powers.UsedThisTurn);
        Assert.Equal([PowerKind.STAR, PowerKind.ASSIGN], moved.Players.First(p => p.Id == a).Powers.Available);
    }

    /// <summary>
    /// Luật: mỗi lượt thí sinh có đúng một power (STAR hoặc ASSIGN), cân nhắc
    /// lại được ở từng câu; huỷ trước khi mở câu thì trả lại; sang thí sinh
    /// khác thì nạp lại đủ hai.
    /// </summary>
    [Fact]
    public void Staged_OnePowerPerTurn_UnstageRefunds_NextTurnRearms()
    {
        var (state, a, b) = RiengStaged();

        // Câu 1: không chọn — câu sau vẫn còn quyền.
        var opened1 = VeDichTurn.OpenPhase2Question(state, "40-1", Now);
        var after1 = VeDichTurn.ResolveQuestion(
            VeDichTurn.CloseCurrentAnswer(opened1, Now), new Verdicts(true, null));
        Assert.Equal([PowerKind.STAR, PowerKind.ASSIGN], after1.Players.First(p => p.Id == a).Powers.Available);

        // Câu 2: chọn nhầm ASSIGN rồi huỷ — quyền được trả lại, chọn được STAR.
        var stagedWrong = VeDichTurn.DeclarePower(after1, a, PowerKind.ASSIGN, b);
        var canceled = VeDichTurn.DeclarePower(stagedWrong, a, null);
        var star = VeDichTurn.DeclarePower(canceled, a, PowerKind.STAR);
        Assert.Equal(PowerKind.STAR, star.Players[star.TurnIndex].Powers.Staged!.Power);

        // Câu 2 dùng STAR: hết quyền cho cả lượt, ASSIGN không dùng được nữa.
        var opened2 = VeDichTurn.OpenPhase2Question(star, "50-1", Now);
        var after2 = VeDichTurn.ResolveQuestion(
            VeDichTurn.CloseCurrentAnswer(opened2, Now), new Verdicts(true, null));
        Assert.Empty(after2.Players.First(p => p.Id == a).Powers.Available);
        Assert.Equal("POWER_UNAVAILABLE", CodeOf(() =>
            VeDichTurn.DeclarePower(after2, a, PowerKind.ASSIGN, b)));

        // Sang thí sinh khác: đủ hai quyền lại.
        var next = VeDichTurn.AdvanceTurn(after2);
        Assert.Equal([PowerKind.STAR, PowerKind.ASSIGN], next.Players[next.TurnIndex].Powers.Available);
    }

    [Fact]
    public void Staged_RefusesSpentPower()
    {
        var (state, a) = RiengOpen();
        var spent = state with
        {
            Players = state.Players.Select(p =>
                p.Id == a ? p with { Powers = p.Powers.Spend(PowerKind.STAR) } : p).ToList()
        };
        Assert.Equal("POWER_UNAVAILABLE", CodeOf(() =>
            VeDichTurn.DeclarePower(spent, a, PowerKind.STAR)));
    }

    [Fact]
    public void Staged_TheSpentPowerStaysSpentForTheRestOfTheTurn()
    {
        var (state, a, b) = RiengStaged();
        var s = VeDichTurn.OpenPhase2Question(
            VeDichTurn.DeclarePower(state, a, PowerKind.STAR), "40-1", Now);
        s = VeDichTurn.ResolveQuestion(
            VeDichTurn.CloseCurrentAnswer(s, Now), new Verdicts(true, null));

        // Câu còn lại trong lượt: một power/lượt đã dùng nên không chọn thêm được
        // (không phải vì "đã chọn ở câu này" — quyền lượt đã hết).
        Assert.True(s.PendingPicks.Count > 0);
        Assert.Equal("POWER_UNAVAILABLE", CodeOf(() =>
            VeDichTurn.DeclarePower(s, a, PowerKind.ASSIGN, b)));
        Assert.Empty(s.Players.First(p => p.Id == a).Powers.Available);
    }

    [Fact]
    public void Staged_AdvanceTurnLiftsTheCap()
    {
        var (state, a) = RiengOpen();
        var s = VeDichTurn.OpenPhase2Question(
            VeDichTurn.DeclarePower(state, a, PowerKind.STAR), "40-1", Now);
        s = VeDichTurn.ResolveQuestion(
            VeDichTurn.CloseCurrentAnswer(s, Now), new Verdicts(true, null));
        s = VeDichTurn.AdvanceTurn(s);
        Assert.Equal(false, s.Players[s.TurnIndex].Powers.UsedThisTurn);
        Assert.Null(s.Players[s.TurnIndex].Powers.Staged);

        var next = s.Players[s.TurnIndex].Id;
        s = VeDichTurn.PickPhase2(s, next, s.Remaining.Take(3).Select(q => q.Id).ToList());
        var partner = s.Players.First(p => p.Id != next).Id;
        Assert.Equal("NO_ERROR", CodeOf(() =>
            VeDichTurn.DeclarePower(s, next, PowerKind.ASSIGN, partner)));
    }
}
