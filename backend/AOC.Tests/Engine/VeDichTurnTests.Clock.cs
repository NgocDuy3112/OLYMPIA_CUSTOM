using AOC.Domain.Contracts;
using AOC.Domain.Gameplay;
using AOC.Domain.Gameplay.Turns;
using Xunit;

namespace AOC.Tests.Engine;

public partial class VeDichTurnTests
{
    [Fact]
    public void Clock_StartClockWaitsForTheReveal()
    {
        var picked = VeDichTurn.PickPhase1(
            VeDichTurn.CreateVeDich(Pool, [Player("a", 0)]), "a", "30-1", Now);

        Assert.False(picked.Open!.Revealed);
        Assert.Null(picked.Open!.Window.OpenedAt);
        Assert.Equal("NOT_REVEALED", CodeOf(() => VeDichTurn.StartClock(picked, Now)));

        var running = VeDichTurn.StartClock(VeDichTurn.RevealQuestion(picked, Now), Now);
        Assert.Equal(Now, running.Open!.Window.OpenedAt);
    }

    [Fact]
    public void Clock_StartClockRefusedWhileTheQuestionClockRuns()
    {
        var opened = VeDichTurn.OpenPhase2Question(Picked3(), "50-1");
        var running = VeDichTurn.StartClock(VeDichTurn.RevealQuestion(opened, Now), Now);

        Assert.Equal("ALREADY_OPEN", CodeOf(() => VeDichTurn.StartClock(running, At(1))));
        Assert.Equal(Now, running.Open!.Window.OpenedAt);
        Assert.Equal(45, running.Open!.Window.Seconds);
    }

    [Fact]
    public void Clock_StartClockRefusedOnASettledRaceWindow()
    {
        var s = TwoUp();
        var racing = StageOpen(s, s.Players[0].Id, PowerKind.ASSIGN, s.Players[1].Id);

        Assert.Equal("ALREADY_OPEN", CodeOf(() => VeDichTurn.StartClock(racing, At(1))));
        Assert.Equal(Now, racing.Open!.Window.OpenedAt);
    }

    [Fact]
    public void CloseAnswer_RefusedBeforeTheClockStarts()
    {
        var opened = VeDichTurn.OpenPhase2Question(Picked3(), "50-1");

        Assert.Equal("CLOCK_NOT_STARTED", CodeOf(() => VeDichTurn.CloseCurrentAnswer(opened, Now)));
        Assert.Equal(AnswerMode.Oral, opened.Open!.Window.Mode);
    }

    [Fact]
    public void CloseAnswer_RefusedWhileTheClockIsStillRunning()
    {
        var opened = VeDichTurn.OpenPhase2Question(Picked3(), "50-1");
        var running = VeDichTurn.StartClock(VeDichTurn.RevealQuestion(opened, Now), Now);

        Assert.Equal("CLOCK_STILL_RUNNING", CodeOf(() => VeDichTurn.CloseCurrentAnswer(running, At(1))));
        Assert.Equal(AnswerMode.Oral, running.Open!.Window.Mode);

        var spent = VeDichTurn.CloseCurrentAnswer(running, At(46));
        Assert.Equal(AnswerMode.Buzz, spent.Open!.Window.Mode);
        Assert.Equal(At(46), spent.Open!.Window.OpenedAt);
        Assert.Equal(running.Rules.BuzzWindowS, spent.Open!.Window.Seconds);
    }

    [Fact]
    public void BuzzWindowWithoutAssignStaysAtTheBaseWindow()
    {
        var s = TwoUp();
        var a = s.Players[0].Id;
        var after = StageOpen(s, a, PowerKind.STAR);
        Assert.Equal(after.Rules.BuzzWindowS, VeDichTurn.BuzzWindowSeconds(after));
    }

    [Fact]
    public void Phase2_NoBuzzBeforeWindow()
    {
        var state = Picked3();
        state = VeDichTurn.OpenPhase2Question(state, "50-1");
        Assert.Equal("ALREADY_OPEN", CodeOf(() => VeDichTurn.Buzz(state, "a", Now)));
    }

    [Fact]
    public void Phase2_NoBuzzCurrentCorrectScoresOnce()
    {
        var state = Picked3();
        state = VeDichTurn.ResolveQuestion(
            ClockRanOut(VeDichTurn.OpenPhase2Question(state, "50-1")), new Verdicts(true, null), Now);
        Assert.Equal(60, state.Players.First(p => p.Id == "c").Score);
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
        var s = VeDichTurn.ResolveQuestion(Buzzing(), new Verdicts(true, null), Now);
        Assert.False(VeDichTurn.IsBuzzOpen(s, Now));
    }
}
