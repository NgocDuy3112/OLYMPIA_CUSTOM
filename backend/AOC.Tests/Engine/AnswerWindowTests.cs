using AOC.Domain.Contracts;
using AOC.Domain.Gameplay.Turns;
using Xunit;

namespace AOC.Tests.Engine;

public class AnswerWindowTests
{
    private const string T0 = "2026-01-01T00:00:00.000Z";

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

    [Fact]
    public void AnUnstartedWindowIsNotOpen()
    {
        var window = AnswerWindow.TypedEveryone(10);

        Assert.False(window.IsOpen(T0));
        Assert.Null(window.Deadline());
        Assert.Equal("WINDOW_NOT_OPEN", CodeOf(() => window.ElapsedMs(T0)));
        Assert.Equal("WINDOW_NOT_OPEN", CodeOf(() => window.AssertCanAnswer("a", T0)));
    }

    [Fact]
    public void OpenedForSecondsClosesOnTheDeadline()
    {
        var window = AnswerWindow.TypedEveryone(10).Open(T0);

        Assert.True(window.IsOpen(At(9.999)));
        Assert.True(window.IsOpen(At(10)));
        Assert.False(window.IsOpen(At(10.001)));
        Assert.Equal(At(10), window.Deadline());
        Assert.Equal(2500, window.ElapsedMs(At(2.5)));
    }

    [Fact]
    public void AnOpenWindowWithoutSecondsStaysOpenUntilLocked()
    {
        var window = AnswerWindow.OralCurrentTurn("a").Open(T0);

        Assert.True(window.IsOpen(At(3600)));
        Assert.Null(window.Deadline());
        Assert.False(window.Lock().IsOpen(T0));
    }

    [Fact]
    public void PreOpenedWindowClosesAfterItsSeconds()
    {
        var window = AnswerWindow.KeywordWindow(T0, 15);

        Assert.Null(window.OpenedAt);
        Assert.True(window.IsOpen(At(0)));
        Assert.True(window.IsOpen(At(15)));
        Assert.False(window.IsOpen(At(15.001)));
        Assert.Equal(At(15), window.Deadline());
    }

    [Fact]
    public void OpeningAndClosingFormsAreMutuallyExclusive()
    {
        var opening = AnswerWindow.TypedEveryone(10);
        var closing = AnswerWindow.KeywordWindow(T0, 15);

        Assert.Equal("INVALID_WINDOW",
            CodeOf(() => (opening.Open(T0) with { ClosesAt = At(5) }).AssertValid()));
        Assert.Equal("INVALID_WINDOW", CodeOf(() => opening.Open(T0).Open(At(1))));
        Assert.Equal("INVALID_WINDOW", CodeOf(() => closing.CloseAfter(T0, 5)));
        Assert.Equal("INVALID_WINDOW", CodeOf(() => closing.Open(T0)));
    }

    [Fact]
    public void ElapsedNeverGoesBackwards()
    {
        var window = AnswerWindow.TypedEveryone(10).Open(At(5));

        Assert.Equal(0, window.ElapsedMs(At(1)));
    }

    [Fact]
    public void EveryoneMayAnswer()
    {
        var window = AnswerWindow.TypedEveryone(10).Open(T0);

        Assert.NotNull(window.AssertCanAnswer("a", T0));
        Assert.NotNull(window.AssertCanAnswer("b", T0));
    }

    [Fact]
    public void CurrentTurnExcludesTheOthers()
    {
        var window = AnswerWindow.TypedCurrentTurn(30, "a").Open(T0);

        Assert.NotNull(window.AssertCanAnswer("a", At(1)));
        Assert.Equal("NOT_YOUR_TURN", CodeOf(() => window.AssertCanAnswer("b", At(1))));
    }

    [Fact]
    public void OthersExcludesTheTurnPlayer()
    {
        var window = AnswerWindow.BuzzOthers(5, "a").Open(T0);

        Assert.Equal("NOT_YOUR_TURN", CodeOf(() => window.AssertCanAnswer("a", At(1))));
        Assert.NotNull(window.AssertCanAnswer("b", At(1)));
    }

    [Fact]
    public void PairKeepsTheRaceBetweenTheTwoSides()
    {
        var window = AnswerWindow.BuzzPair("a", "b", 20).Open(T0);

        Assert.NotNull(window.AssertCanAnswer("a", At(1)));
        Assert.NotNull(window.AssertCanAnswer("b", At(1)));
        Assert.Equal("NOT_YOUR_TURN", CodeOf(() => window.AssertCanAnswer("c", At(1))));
    }

    [Fact]
    public void APairWindowNeedsBothSides()
    {
        var window = AnswerWindow.BuzzPair("a", "b", 20) with { PairB = null };

        Assert.Equal("INVALID_WINDOW", CodeOf(() => window.AssertValid()));
    }

    [Fact]
    public void BuzzRecordsTheFirstArrivalAndRefusesTheSecond()
    {
        var window = AnswerWindow.BuzzOthers(5, "a").Open(T0);
        var buzzed = window.Buzz("b", At(1.25));

        Assert.Equal("b", buzzed.Buzzer);
        Assert.Equal(1250, buzzed.BuzzerMs);
        Assert.Equal("ALREADY_BUZZED", CodeOf(() => buzzed.Buzz("c", At(1.5))));
    }

    [Fact]
    public void BuzzAfterTheDeadlineIsTooLate()
    {
        var window = AnswerWindow.BuzzOthers(5, "a").Open(T0);

        Assert.Equal("TOO_LATE", CodeOf(() => window.Buzz("b", At(5.5))));
    }

    [Fact]
    public void ABuzzWindowNeedsAnOpenedAt()
    {
        var window = AnswerWindow.BuzzOthers(5, "a");

        Assert.Equal("WINDOW_NOT_OPEN", CodeOf(() => window.Buzz("b", T0)));
    }

    [Fact]
    public void OnlyABuzzWindowBuzzes()
    {
        var window = AnswerWindow.TypedEveryone(10).Open(T0);

        Assert.Equal("WINDOW_NOT_OPEN", CodeOf(() => window.Buzz("b", T0)));
    }

    [Fact]
    public void ReopeningAsBuzzHandsTheFloorToTheOthers()
    {
        var oral = AnswerWindow.OralCurrentTurn("a").Open(T0);
        var buzz = oral.ReopenAsBuzz("a", 5, At(20));

        Assert.Equal(AnswerMode.Buzz, buzz.Mode);
        Assert.Equal(AnswerEligibility.Others, buzz.Eligibility);
        Assert.Equal("a", buzz.TurnPlayerId);
        Assert.Equal(At(20), buzz.OpenedAt);
        Assert.Equal(At(25), buzz.Deadline());
        Assert.Null(buzz.Buzzer);
        Assert.Equal("INVALID_WINDOW", CodeOf(() => buzz.ReopenAsBuzz("a", 5, At(21))));
    }

    [Fact]
    public void LockedWindowRefusesEveryone()
    {
        var window = AnswerWindow.TypedEveryone(10).Open(T0).Lock();

        Assert.Equal("WINDOW_CLOSED", CodeOf(() => window.AssertCanAnswer("a", At(1))));
    }

    [Fact]
    public void AnUnstartedWindowCannotBeLocked()
    {
        var window = AnswerWindow.TypedEveryone(10);

        Assert.Equal("WINDOW_NOT_OPEN", CodeOf(() => window.Lock()));
        Assert.True(window.Close().Locked);
    }
}
