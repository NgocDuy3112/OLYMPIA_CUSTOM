using AOC.Domain.Contracts;
using AOC.Domain.Gameplay.Turns;
using Xunit;

namespace AOC.Tests.Engine;

public class TieBreakTests
{
    private const string T0 = "2026-01-01T00:00:00.000Z";

    private static readonly string[] Questions = ["tb1", "tb2", "tb3"];

    private static string At(double sec) =>
        DateTimeOffset.Parse(T0).AddMilliseconds((long)(sec * 1000)).UtcDateTime
            .ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'");

    private static string CodeOf(Action fn)
    {
        try
        {
            fn();
        }
        catch (RuleError e)
        {
            return e.Code;
        }
        return "NO_ERROR";
    }

    private static TieBreakState Started() => TieBreakTurn.StartTieBreak(["a", "b"], Questions);

    private static TieBreakState Open() => TieBreakTurn.OpenBuzz(Started(), T0);

    private static TieBreakState Started3() => TieBreakTurn.StartTieBreak(["a", "b", "c"], Questions);

    private static TieBreakState Open3() => TieBreakTurn.OpenBuzz(Started3(), T0);

    [Fact]
    public void NeedsAtLeastTwoDistinctPlayersAndOneQuestion()
    {
        Assert.Equal("VALIDATION", CodeOf(() => TieBreakTurn.StartTieBreak(["a"], Questions)));
        Assert.Equal("VALIDATION", CodeOf(() => TieBreakTurn.StartTieBreak(["a", "a"], Questions)));
        Assert.Equal("VALIDATION", CodeOf(() => TieBreakTurn.StartTieBreak(["a", "b"], [])));

        var state = Started();
        Assert.Equal(new List<string> { "a", "b" }, state.Players);
        Assert.Equal("tb1", TieBreakTurn.CurrentQuestionId(state));
        Assert.False(state.Window.HasStarted);
    }

    [Fact]
    public void BuzzNeedsAnOpenWindow()
    {
        Assert.Equal("WINDOW_NOT_OPEN", CodeOf(() => TieBreakTurn.Buzz(Started(), "a", T0)));
        Assert.Equal("tb1", TieBreakTurn.CurrentQuestionId(Open()));
    }

    [Fact]
    public void OpeningTwiceIsRefused()
    {
        Assert.Equal("ALREADY_OPEN", CodeOf(() => TieBreakTurn.OpenBuzz(Open(), T0)));
    }

    [Fact]
    public void FirstBuzzWinsAndTheSecondIsBlocked()
    {
        var buzzed = TieBreakTurn.Buzz(Open(), "a", At(1.24));
        Assert.Equal("a", buzzed.Window.Buzzer);
        Assert.Equal(1240, buzzed.Window.BuzzerMs);
        Assert.Equal("ALREADY_BUZZED", CodeOf(() => TieBreakTurn.Buzz(buzzed, "b", At(2))));
    }

    [Fact]
    public void BuzzAfterTheWindowIsTooLate()
    {
        Assert.Equal("TOO_LATE", CodeOf(() => TieBreakTurn.Buzz(Open(), "a", At(6))));
    }

    [Fact]
    public void OnlyTiedPlayersMayBuzz()
    {
        Assert.Equal("NOT_A_TIED_PLAYER", CodeOf(() => TieBreakTurn.Buzz(Open(), "z", At(1))));
    }

    [Fact]
    public void LockedWindowRefusesBuzzes()
    {
        var locked = TieBreakTurn.LockBuzz(Open());
        Assert.Equal("WINDOW_CLOSED", CodeOf(() => TieBreakTurn.Buzz(locked, "a", At(1))));
    }

    [Fact]
    public void CorrectBuzzScoresAndMovesOn()
    {
        var judged = TieBreakTurn.Judge(TieBreakTurn.Buzz(Open(), "a", At(1)), correct: true);
        Assert.Equal(10, TieBreakTurn.TieBreakScore(judged, "a"));
        Assert.Equal(0, TieBreakTurn.TieBreakScore(judged, "b"));
        Assert.Equal("tb2", TieBreakTurn.CurrentQuestionId(judged));
        Assert.Null(judged.Window.Buzzer);
        Assert.False(judged.Window.HasStarted);
    }

    [Fact]
    public void CorrectBuzzUsesTheConfiguredPoints()
    {
        var state = TieBreakTurn.StartTieBreak(
            ["a", "b"], Questions, new TieBreakRules(PointsPerCorrect: 25));

        var judged = TieBreakTurn.Judge(
            TieBreakTurn.Buzz(TieBreakTurn.OpenBuzz(state, T0), "a", At(1)), correct: true);

        Assert.Equal(25, TieBreakTurn.TieBreakScore(judged, "a"));
        Assert.Equal(0, TieBreakTurn.TieBreakScore(judged, "b"));
    }

    [Fact]
    public void JudgingNeedsABuzzer()
    {
        Assert.Equal("NO_BUZZER", CodeOf(() => TieBreakTurn.Judge(Open(), correct: true)));
    }

    [Fact]
    public void WrongBuzzLeavesTheTieBreakAndTheQuestionStays()
    {
        var judged = TieBreakTurn.Judge(TieBreakTurn.Buzz(Open3(), "a", At(1)), correct: false);
        Assert.Contains("a", judged.Eliminated);
        Assert.Null(judged.Window.Buzzer);
        Assert.False(judged.Ended);
        Assert.Equal("tb1", TieBreakTurn.CurrentQuestionId(judged));
        Assert.Equal(new List<string> { "b", "c" }, TieBreakTurn.ActivePlayers(judged));
    }

    [Fact]
    public void AfterAWrongBuzzTheRemainderMayBuzzAgain()
    {
        var judged = TieBreakTurn.Judge(TieBreakTurn.Buzz(Open3(), "a", At(1)), correct: false);
        Assert.Equal("ELIMINATED", CodeOf(() => TieBreakTurn.Buzz(
            TieBreakTurn.OpenBuzz(judged, T0), "a", At(1))));

        var b = TieBreakTurn.Buzz(TieBreakTurn.OpenBuzz(judged, T0), "b", At(1));
        Assert.Equal("b", b.Window.Buzzer);
    }

    [Fact]
    public void TieBreakEndsAsSoonAsOnePlayerRemains()
    {
        var one = TieBreakTurn.Judge(TieBreakTurn.Buzz(Open(), "a", At(1)), correct: false);
        Assert.True(one.Ended);
        Assert.Equal(new List<string> { "b" }, TieBreakTurn.ActivePlayers(one));
        Assert.Equal("ENDED", CodeOf(() => TieBreakTurn.OpenBuzz(one, T0)));
    }

    [Fact]
    public void RunningOutOfQuestionsEndsTheTieBreak()
    {
        var state = Started();
        for (var i = 0; i < Questions.Length; i += 1)
            state = TieBreakTurn.Judge(
                TieBreakTurn.Buzz(TieBreakTurn.OpenBuzz(state, T0), "a", At(1)), correct: true);

        Assert.True(state.Ended);
        Assert.Equal(30, TieBreakTurn.TieBreakScore(state, "a"));
        Assert.Null(TieBreakTurn.CurrentQuestionId(state));
    }

    [Fact]
    public void RankWithTieBreakBreaksEqualTotals()
    {
        var ranks = TieBreakTurn.RankWithTieBreak(
            [new RankedEntry("a", 100), new RankedEntry("b", 100), new RankedEntry("c", 90)],
            new Dictionary<string, int> { ["a"] = 0, ["b"] = 10 });

        Assert.Equal(1, ranks["b"]);
        Assert.Equal(2, ranks["a"]);
        Assert.Equal(3, ranks["c"]);
    }

    [Fact]
    public void WithoutATieBreakEqualTotalsShareTheRank()
    {
        var ranks = TieBreakTurn.RankWithTieBreak(
            [new RankedEntry("a", 100), new RankedEntry("b", 100)], null);

        Assert.Equal(ranks["a"], ranks["b"]);
    }
}
