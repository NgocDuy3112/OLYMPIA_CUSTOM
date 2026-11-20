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
            VeDichTurn.CloseCurrentAnswer(VeDichTurn.OpenPhase2Question(state, "50-1"), Now),
            new Verdicts(true, null));
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
        var s = VeDichTurn.ResolveQuestion(Buzzing(), new Verdicts(true, null));
        Assert.False(VeDichTurn.IsBuzzOpen(s, Now));
    }
}
