using Olympia.Domain.Engine;
using Olympia.Domain.Engine.Turns;
using Xunit;

namespace Olympia.Tests.Engine;

public class KhoiDongTurnTests
{
    private static readonly string[] Ids6 = ["q1", "q2", "q3", "q4", "q5", "q6"];
    private const string T0 = "2026-01-01T00:00:00.000Z";

    private static string At(int seconds) =>
        DateTimeOffset.Parse(T0).AddSeconds(seconds).UtcDateTime
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

    // ---- phase 1 -----------------------------------------------------------------

    [Fact]
    public void Phase1_RequiresExactlySixQuestions()
    {
        Assert.Equal("VALIDATION", CodeOf(() =>
            KhoiDongTurn.StartPhase1(["a", "b"], RoundRules.DefaultKhoiDong())));
    }

    [Fact]
    public void Phase1_SixCorrectWithinBudget_SixtyPoints()
    {
        var s = KhoiDongTurn.StartPhase1(Ids6, RoundRules.DefaultKhoiDong());
        for (var i = 0; i < 6; i++)
            s = KhoiDongTurn.AnswerPhase1(s, correct: true, spentS: 5);
        Assert.True(s.Ended);
        Assert.Equal(60, KhoiDongTurn.Phase1Total(s));
    }

    [Fact]
    public void Phase1_WrongAnswersScoreZeroButUseTheClock()
    {
        var s = KhoiDongTurn.StartPhase1(Ids6, RoundRules.DefaultKhoiDong());
        s = KhoiDongTurn.AnswerPhase1(s, correct: true, spentS: 5);
        s = KhoiDongTurn.AnswerPhase1(s, correct: false, spentS: 5);
        Assert.Equal(2, s.Cursor);
        Assert.Equal(10, KhoiDongTurn.Phase1Total(s));
    }

    [Fact]
    public void Phase1_BudgetIsSharedAcrossThePhase()
    {
        var s = KhoiDongTurn.StartPhase1(Ids6, RoundRules.DefaultKhoiDong());
        s = KhoiDongTurn.AnswerPhase1(s, correct: true, spentS: 20);
        s = KhoiDongTurn.AnswerPhase1(s, correct: true, spentS: 20);
        Assert.Equal(40, s.ElapsedS);
        Assert.False(s.Ended);
    }

    [Fact]
    public void Phase1_AnswerPastBudgetIsNotCounted()
    {
        var s = KhoiDongTurn.StartPhase1(Ids6, RoundRules.DefaultKhoiDong());
        s = KhoiDongTurn.AnswerPhase1(s, correct: true, spentS: 30);
        s = KhoiDongTurn.AnswerPhase1(s, correct: true, spentS: 20);
        Assert.True(s.Ended);
        Assert.Equal(10, KhoiDongTurn.Phase1Total(s));
    }

    [Fact]
    public void Phase1_TimeOutEndsThePhase()
    {
        var s = KhoiDongTurn.StartPhase1(Ids6, RoundRules.DefaultKhoiDong());
        s = KhoiDongTurn.AnswerPhase1(s, correct: true, spentS: 5);
        s = KhoiDongTurn.TimeOutPhase1(s);
        Assert.True(s.Ended);
        Assert.Equal(10, KhoiDongTurn.Phase1Total(s));
    }

    [Fact]
    public void Phase1_CannotAnswerAfterEnded()
    {
        var s = KhoiDongTurn.TimeOutPhase1(
            KhoiDongTurn.StartPhase1(Ids6, RoundRules.DefaultKhoiDong()));
        Assert.Equal("PHASE_ENDED", CodeOf(() =>
            KhoiDongTurn.AnswerPhase1(s, correct: true, spentS: 1)));
    }

    // ---- phase 2 -----------------------------------------------------------------

    [Fact]
    public void Phase2_IsSixQuestionsAndRefusesAnythingElse()
    {
        Assert.Equal("VALIDATION", CodeOf(() =>
            KhoiDongTurn.StartPhase2(["x"], RoundRules.DefaultKhoiDong())));
        Assert.Equal("VALIDATION", CodeOf(() =>
            KhoiDongTurn.StartPhase2(Ids6.Take(3), RoundRules.DefaultKhoiDong())));
        Assert.Equal(6, KhoiDongTurn.StartPhase2(Ids6, RoundRules.DefaultKhoiDong()).QuestionIds.Count);
    }

    [Fact]
    public void Phase2_NothingRunsBeforeBangGio()
    {
        var s = KhoiDongTurn.StartPhase2(Ids6, RoundRules.DefaultKhoiDong());
        Assert.Null(s.OpenedAt);
        Assert.False(KhoiDongTurn.IsPhase2WindowOpen(s, T0));
        Assert.Equal("q1", KhoiDongTurn.Phase2QuestionId(s));
    }

    [Fact]
    public void Phase2_BangGioOpensTheWindowOnce()
    {
        var s = KhoiDongTurn.OpenPhase2Window(
            KhoiDongTurn.StartPhase2(Ids6, RoundRules.DefaultKhoiDong()), T0);
        Assert.Equal(T0, s.OpenedAt);
        Assert.True(KhoiDongTurn.IsPhase2WindowOpen(s, At(1)));
        Assert.Equal("ALREADY_OPEN", CodeOf(() => KhoiDongTurn.OpenPhase2Window(s, At(1))));
    }

    [Fact]
    public void Phase2_WindowIsExactlyTenSeconds()
    {
        var s = KhoiDongTurn.OpenPhase2Window(
            KhoiDongTurn.StartPhase2(Ids6, RoundRules.DefaultKhoiDong()), T0);
        Assert.True(KhoiDongTurn.IsPhase2WindowOpen(s, At(10)));
        Assert.False(KhoiDongTurn.IsPhase2WindowOpen(s,
            DateTimeOffset.Parse(T0).AddMilliseconds(10001).UtcDateTime
                .ToString("yyyy-MM-ddTHH:mm:ss.fffZ")));
    }

    [Fact]
    public void Phase2_ConsoleMayGiveAnotherWindow()
    {
        var s = KhoiDongTurn.OpenPhase2Window(
            KhoiDongTurn.StartPhase2(Ids6, RoundRules.DefaultKhoiDong()), T0);
        s = KhoiDongTurn.OpenPhase2Window(s, At(12));
        Assert.Equal(At(12), s.OpenedAt);
        Assert.True(KhoiDongTurn.IsPhase2WindowOpen(s, At(15)));
    }

    [Fact]
    public void Phase2_JudgingPaysIndependently()
    {
        var s = KhoiDongTurn.OpenPhase2Window(
            KhoiDongTurn.StartPhase2(Ids6, RoundRules.DefaultKhoiDong()), T0);
        s = KhoiDongTurn.JudgePhase2Card(s, "a", true);
        s = KhoiDongTurn.JudgePhase2Card(s, "b", true);
        s = KhoiDongTurn.JudgePhase2Card(s, "c", false);
        Assert.Equal(10, KhoiDongTurn.Phase2Points(s, "a"));
        Assert.Equal(10, KhoiDongTurn.Phase2Points(s, "b"));
        Assert.Equal(0, KhoiDongTurn.Phase2Points(s, "c"));
    }

    [Fact]
    public void Phase2_RemarkingCorrectsInsteadOfPayingTwice()
    {
        var s = KhoiDongTurn.OpenPhase2Window(
            KhoiDongTurn.StartPhase2(Ids6, RoundRules.DefaultKhoiDong()), T0);
        s = KhoiDongTurn.JudgePhase2Card(s, "a", true);
        s = KhoiDongTurn.JudgePhase2Card(s, "a", false);
        Assert.Equal(0, KhoiDongTurn.Phase2Points(s, "a"));
        s = KhoiDongTurn.JudgePhase2Card(s, "a", true);
        Assert.Equal(10, KhoiDongTurn.Phase2Points(s, "a"));
    }

    [Fact]
    public void Phase2_JudgingAfterCloseIsRefused()
    {
        var done = KhoiDongTurn.ClosePhase2(
            KhoiDongTurn.StartPhase2(Ids6, RoundRules.DefaultKhoiDong()));
        Assert.Equal("PHASE_ENDED", CodeOf(() => KhoiDongTurn.JudgePhase2Card(done, "a", true)));
    }

    [Fact]
    public void Phase2_AdvancingMovesCursorAndKillsWindow()
    {
        var s = KhoiDongTurn.OpenPhase2Window(
            KhoiDongTurn.StartPhase2(Ids6, RoundRules.DefaultKhoiDong()), T0);
        s = KhoiDongTurn.NextPhase2(s);
        Assert.Equal(1, s.Index);
        Assert.Null(s.OpenedAt);
        Assert.Equal("q2", KhoiDongTurn.Phase2QuestionId(s));
        Assert.False(KhoiDongTurn.IsPhase2WindowOpen(s, At(11)));
    }

    [Fact]
    public void Phase2_AdvancingPastLastCompletes()
    {
        var s = KhoiDongTurn.StartPhase2(Ids6, RoundRules.DefaultKhoiDong());
        for (var i = 0; i < 6; i++)
            s = KhoiDongTurn.NextPhase2(s);
        Assert.True(KhoiDongTurn.Phase2Complete(s));
        Assert.True(s.Closed);
        Assert.Null(KhoiDongTurn.Phase2QuestionId(s));
        Assert.Equal("PHASE_ENDED", CodeOf(() => KhoiDongTurn.OpenPhase2Window(s, T0)));
        Assert.Equal("PHASE_ENDED", CodeOf(() => KhoiDongTurn.JudgePhase2Card(s, "a", true)));
        Assert.Equal("PHASE_ENDED", CodeOf(() => KhoiDongTurn.NextPhase2(s)));
    }

    [Fact]
    public void Phase2_ClosingEndsIt()
    {
        var s = KhoiDongTurn.ClosePhase2(
            KhoiDongTurn.OpenPhase2Window(KhoiDongTurn.StartPhase2(Ids6, RoundRules.DefaultKhoiDong()), T0));
        Assert.True(KhoiDongTurn.Phase2Complete(s));
        Assert.Equal("PHASE_ENDED", CodeOf(() => KhoiDongTurn.NextPhase2(s)));
    }
}
