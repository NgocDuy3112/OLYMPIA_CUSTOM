using AOC.Domain.Engine;
using AOC.Domain.Engine.Turns;
using Xunit;

namespace AOC.Tests.Engine;

public class ButPhaTurnTests
{
    private static readonly string[] Ids = ["q1", "q2", "q3", "q4"];
    private const string Now = "2026-01-01T00:00:00.000Z";

    private static string At(double sec) =>
        DateTimeOffset.Parse(Now).AddMilliseconds((long)(sec * 1000)).UtcDateTime
            .ToString("yyyy-MM-ddTHH:mm:ss.fffZ");

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
    public void WorkedExample_60_30_20()
    {
        var s = ButPhaTurn.StartButPha(Ids, RoundRules.DefaultButPha());
        s = ButPhaTurn.SubmitAnswer(s, new ButPhaAnswer { PlayerId = "a", Correct = true, AtS = 3 });
        s = ButPhaTurn.SubmitAnswer(s, new ButPhaAnswer { PlayerId = "b", Correct = true, AtS = 7 });
        s = ButPhaTurn.SubmitAnswer(s, new ButPhaAnswer { PlayerId = "c", Correct = true, AtS = 12 });
        Assert.Equal(60, ButPhaTurn.ButPhaTotal(s, "a"));
        Assert.Equal(30, ButPhaTurn.ButPhaTotal(s, "b"));
        Assert.Equal(20, ButPhaTurn.ButPhaTotal(s, "c"));
    }

    [Fact]
    public void Sequencing_RequiresExactlyFourQuestions()
    {
        Assert.Equal("VALIDATION", CodeOf(() => ButPhaTurn.StartButPha(["a"], RoundRules.DefaultButPha())));
    }

    [Fact]
    public void Sequencing_MovesThroughFourThenEnds()
    {
        var s = ButPhaTurn.StartButPha(Ids, RoundRules.DefaultButPha());
        for (var i = 0; i < 4; i++)
            s = ButPhaTurn.CloseQuestion(s);
        Assert.True(s.Ended);
    }

    [Fact]
    public void Sequencing_CannotAnswerAfterEnded()
    {
        var s = ButPhaTurn.StartButPha(Ids, RoundRules.DefaultButPha());
        for (var i = 0; i < 4; i++)
            s = ButPhaTurn.CloseQuestion(s);
        Assert.Equal("ENDED", CodeOf(() =>
            ButPhaTurn.SubmitAnswer(s, new ButPhaAnswer { PlayerId = "a", Correct = true, AtS = 1 })));
    }

    [Fact]
    public void SpeedOrder_ResetsForEachQuestion()
    {
        var s = ButPhaTurn.StartButPha(Ids, RoundRules.DefaultButPha());
        s = ButPhaTurn.SubmitAnswer(s, new ButPhaAnswer { PlayerId = "a", Correct = true, AtS = 3 });
        s = ButPhaTurn.CloseQuestion(s);
        s = ButPhaTurn.SubmitAnswer(s, new ButPhaAnswer { PlayerId = "b", Correct = true, AtS = 3 });
        Assert.Equal(60, ButPhaTurn.ButPhaTotal(s, "a"));
        Assert.Equal(60, ButPhaTurn.ButPhaTotal(s, "b"));
    }

    [Fact]
    public void WrongAnswer_ScoresZeroAndTakesNoOrder()
    {
        var s = ButPhaTurn.StartButPha(Ids, RoundRules.DefaultButPha());
        s = ButPhaTurn.SubmitAnswer(s, new ButPhaAnswer { PlayerId = "a", Correct = false, AtS = 1 });
        s = ButPhaTurn.SubmitAnswer(s, new ButPhaAnswer { PlayerId = "b", Correct = true, AtS = 3 });
        Assert.Equal(0, ButPhaTurn.ButPhaTotal(s, "a"));
        Assert.Equal(60, ButPhaTurn.ButPhaTotal(s, "b"));
    }

    [Fact]
    public void FourthCorrectAnswerEarnsBaseTimesOne()
    {
        var s = ButPhaTurn.StartButPha(Ids, RoundRules.DefaultButPha());
        s = ButPhaTurn.SubmitAnswer(s, new ButPhaAnswer { PlayerId = "a", Correct = true, AtS = 1 });
        s = ButPhaTurn.SubmitAnswer(s, new ButPhaAnswer { PlayerId = "b", Correct = true, AtS = 1 });
        s = ButPhaTurn.SubmitAnswer(s, new ButPhaAnswer { PlayerId = "c", Correct = true, AtS = 1 });
        s = ButPhaTurn.SubmitAnswer(s, new ButPhaAnswer { PlayerId = "d", Correct = true, AtS = 20 });
        Assert.Equal(5, ButPhaTurn.ButPhaTotal(s, "d"));
    }

    [Fact]
    public void AnswerAfter30sScoresZero()
    {
        var s = ButPhaTurn.StartButPha(Ids, RoundRules.DefaultButPha());
        s = ButPhaTurn.SubmitAnswer(s, new ButPhaAnswer { PlayerId = "late", Correct = true, AtS = 30.5 });
        s = ButPhaTurn.SubmitAnswer(s, new ButPhaAnswer { PlayerId = "b", Correct = true, AtS = 3 });
        Assert.Equal(0, ButPhaTurn.ButPhaTotal(s, "late"));
        Assert.Equal(60, ButPhaTurn.ButPhaTotal(s, "b"));
    }

    [Fact]
    public void AnswerAtExactly30sIsInTime()
    {
        var s = ButPhaTurn.StartButPha(Ids, RoundRules.DefaultButPha());
        s = ButPhaTurn.SubmitAnswer(s, new ButPhaAnswer { PlayerId = "edge", Correct = true, AtS = 30 });
        Assert.Equal(20, ButPhaTurn.ButPhaTotal(s, "edge"));
    }

    [Fact]
    public void EachPlayerAnswersAQuestionOnlyOnce()
    {
        var s = ButPhaTurn.StartButPha(Ids, RoundRules.DefaultButPha());
        s = ButPhaTurn.SubmitAnswer(s, new ButPhaAnswer { PlayerId = "a", Correct = true, AtS = 2 });
        Assert.Equal("ALREADY_ANSWERED", CodeOf(() =>
            ButPhaTurn.SubmitAnswer(s, new ButPhaAnswer { PlayerId = "a", Correct = true, AtS = 3 })));
    }

    [Fact]
    public void UnansweredCorrectlyAwardsNothing()
    {
        var s = ButPhaTurn.StartButPha(Ids, RoundRules.DefaultButPha());
        s = ButPhaTurn.SubmitAnswer(s, new ButPhaAnswer { PlayerId = "a", Correct = false, AtS = 2 });
        Assert.Equal(0, ButPhaTurn.ButPhaTotal(s, "a"));
    }

    [Fact]
    public void Clock_FreshRoundHasNoClock()
    {
        Assert.Null(ButPhaTurn.StartButPha(Ids, RoundRules.DefaultButPha()).QuestionOpenedAt);
    }

    [Fact]
    public void Clock_OpeningRevealsAndTheClockWaitsForStartClock()
    {
        var open = ButPhaTurn.OpenCurrentQuestion(ButPhaTurn.StartButPha(Ids, RoundRules.DefaultButPha()), Now);
        Assert.Equal(Now, open.QuestionRevealedAt);
        Assert.Null(open.QuestionOpenedAt);
        Assert.Equal("QUESTION_OPEN", CodeOf(() => ButPhaTurn.OpenCurrentQuestion(open, Now)));

        var running = ButPhaTurn.StartClock(open, Now);
        Assert.Equal(Now, running.QuestionOpenedAt);
        Assert.Equal("QUESTION_NOT_REVEALED", CodeOf(() => ButPhaTurn.StartClock(
            ButPhaTurn.StartButPha(Ids, RoundRules.DefaultButPha()), Now)));
    }

    [Fact]
    public void Clock_ElapsedMeasuredFromStartClock()
    {
        var open = ButPhaTurn.OpenCurrentQuestion(ButPhaTurn.StartButPha(Ids, RoundRules.DefaultButPha()), Now);
        Assert.Equal("QUESTION_NOT_OPEN", CodeOf(() => ButPhaTurn.ElapsedSeconds(open, Now)));

        var running = ButPhaTurn.StartClock(open, Now);
        Assert.Equal(0, ButPhaTurn.ElapsedSeconds(running, Now));
        Assert.Equal(3, ButPhaTurn.ElapsedSeconds(running, At(3)));
        Assert.Equal(30, ButPhaTurn.ElapsedSeconds(running, At(30)));
        Assert.Equal(30.5, ButPhaTurn.ElapsedSeconds(running, At(30.5)));
    }

    [Fact]
    public void Clock_ElapsedBeforeOpenIsAnError()
    {
        Assert.Equal("QUESTION_NOT_OPEN", CodeOf(() =>
            ButPhaTurn.ElapsedSeconds(ButPhaTurn.StartButPha(Ids, RoundRules.DefaultButPha()), Now)));
    }

    [Fact]
    public void Clock_ClosingClearsIt()
    {
        var open = ButPhaTurn.OpenCurrentQuestion(ButPhaTurn.StartButPha(Ids, RoundRules.DefaultButPha()), Now);
        Assert.Null(ButPhaTurn.CloseQuestion(open).QuestionOpenedAt);
    }

    [Fact]
    public void Clock_Exactly30sAcceptedPastIsNot()
    {
        var open = ButPhaTurn.OpenCurrentQuestion(ButPhaTurn.StartButPha(Ids, RoundRules.DefaultButPha()), Now);
        var onTime = ButPhaTurn.SubmitAnswer(open, new ButPhaAnswer { PlayerId = "a", Correct = true, AtS = 30 });
        Assert.Equal(5 * 4, ButPhaTurn.ButPhaTotal(onTime, "a"));
        var late = ButPhaTurn.SubmitAnswer(open, new ButPhaAnswer { PlayerId = "b", Correct = true, AtS = 30.5 });
        Assert.Equal(0, ButPhaTurn.ButPhaTotal(late, "b"));
    }
}
