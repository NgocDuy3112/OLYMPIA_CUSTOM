using AOC.Domain.Engine;
using AOC.Domain.Engine.Turns;
using Xunit;

namespace AOC.Tests.Engine;

public class KhoiDongRoundTests
{
    private const string Opened = "2026-01-01T00:00:00.000Z";

    // Riêng is one set of six PER PLAYER: seat 0 takes the first six, seat 1 the next six.
    private static readonly string[] P1Seat0 = ["a1", "a2", "a3", "a4", "a5", "a6"];
    private static readonly string[] P1Seat1 = ["a7", "a8", "a9", "a10", "a11", "a12"];
    private static readonly string[] P1 = [.. P1Seat0, .. P1Seat1];
    private static readonly string[] P2 = ["b1", "b2", "b3", "b4", "b5", "b6"];
    private static readonly string[] Players = ["p0", "p1"];

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

    private static KhoiDongState FinishRun(KhoiDongState state)
    {
        var s = state;
        for (var i = 0; i < 6; i++)
            s = KhoiDongRound.RecordOral(s, correct: true, spentS: 1);
        return s;
    }

    [Fact]
    public void StartsEveryPlayerOnTheirOwnRun()
    {
        var s = KhoiDongRound.StartKhoiDong(Players, P1);
        Assert.Equal(Players, s.Runs.Keys);
        Assert.Equal("p0", KhoiDongRound.ActivePlayerId(s));
        Assert.Equal("a1", KhoiDongRound.ActiveQuestionId(s));
    }

    [Fact]
    public void HandsEachSeatItsOwnSetInSeatOrder()
    {
        var s = KhoiDongRound.StartKhoiDong(Players, P1);
        Assert.Equal(P1Seat0, s.Runs["p0"].QuestionIds);
        Assert.Equal(P1Seat1, s.Runs["p1"].QuestionIds);
    }

    [Fact]
    public void RefusesABundleThatDoesNotCoverEverySeat()
    {
        Assert.Equal("VALIDATION", CodeOf(() =>
            KhoiDongRound.StartKhoiDong(Players, P1Seat0)));
    }

    [Fact]
    public void RecordingOnlyAffectsTheActiveRun()
    {
        var s = KhoiDongRound.RecordOral(KhoiDongRound.StartKhoiDong(Players, P1), correct: true, spentS: 5);
        Assert.Equal(1, s.Runs["p0"].Cursor);
        Assert.Equal(0, s.Runs["p1"].Cursor);
        Assert.Equal("p0", KhoiDongRound.ActivePlayerId(s));
    }

    [Fact]
    public void MarkingAPlayerScoresThemInsteadOfTheCursor()
    {
        var s = KhoiDongRound.RecordOral(
            KhoiDongRound.StartKhoiDong(Players, P1), correct: true, spentS: 2, playerId: "p1");

        // the mark IS who answers now — cursor, fact and projection all follow
        Assert.Equal("p1", KhoiDongRound.ActivePlayerId(s));
        Assert.Equal("a8", KhoiDongRound.ActiveQuestionId(s));
        Assert.Single(s.Runs["p1"].Results);
        Assert.Empty(s.Runs["p0"].Results);
    }

    [Fact]
    public void MarkingRefusesAPlayerWhoIsNotInTheRound()
    {
        var s = KhoiDongRound.StartKhoiDong(Players, P1);
        Assert.Equal("NO_ACTIVE_PLAYER", CodeOf(() =>
            KhoiDongRound.RecordOral(s, correct: true, spentS: 1, playerId: "stranger")));
    }

    [Fact]
    public void NoQuestionIsProjectedUntilTheConsolePicksWhoAnswers()
    {
        var started = KhoiDongRound.StartKhoiDong(Players, P1);
        Assert.False(started.Engaged); // round started → question 1 stays off screen

        var marked = KhoiDongRound.SetTurn(started, "p1");
        Assert.True(marked.Engaged);   // the card click puts it up
        Assert.Equal("p1", KhoiDongRound.ActivePlayerId(marked));

        var graded = KhoiDongRound.RecordOral(marked, correct: true, spentS: 1);
        Assert.True(graded.Engaged);   // …and the run keeps flowing
    }

    [Fact]
    public void SetTurnMovesTheCursorToTheChosenPlayer()
    {
        var s = KhoiDongRound.StartKhoiDong(Players, P1);
        Assert.Equal("p0", KhoiDongRound.ActivePlayerId(s));

        var next = KhoiDongRound.SetTurn(s, "p1");

        // their question is what the projection now shows — first of six
        Assert.Equal("p1", KhoiDongRound.ActivePlayerId(next));
        Assert.Equal("a7", KhoiDongRound.ActiveQuestionId(next));
        Assert.Equal(0, next.Runs["p0"].Cursor);
    }

    [Fact]
    public void SetTurnOnlyWorksDuringTheOralRun()
    {
        var s = KhoiDongRound.StartKhoiDong(Players, P1);
        Assert.Equal("NO_ACTIVE_PLAYER", CodeOf(() => KhoiDongRound.SetTurn(s, "stranger")));

        var p2 = KhoiDongRound.BeginPhase2(s, P2);
        Assert.Equal("WRONG_STAGE", CodeOf(() => KhoiDongRound.SetTurn(p2, "p1")));
    }

    [Fact]
    public void WhenActiveRunEndsNextPlayerBecomesActive()
    {
        var s = FinishRun(KhoiDongRound.StartKhoiDong(Players, P1));
        Assert.Equal("p1", KhoiDongRound.ActivePlayerId(s));
        Assert.False(KhoiDongRound.Phase1Complete(s));
    }

    [Fact]
    public void EachRunHasItsOwnBudget()
    {
        var s = KhoiDongRound.RecordOral(KhoiDongRound.StartKhoiDong(Players, P1), correct: true, spentS: 40);
        Assert.Equal(40, s.Runs["p0"].ElapsedS);
        Assert.Equal(0, s.Runs["p1"].ElapsedS);
        Assert.False(s.Runs["p0"].Ended);
    }

    [Fact]
    public void TimingOutARunMovesToTheNextPlayer()
    {
        var s = KhoiDongRound.TimeOutRun(KhoiDongRound.StartKhoiDong(Players, P1));
        Assert.True(s.Runs["p0"].Ended);
        Assert.Equal("p1", KhoiDongRound.ActivePlayerId(s));
    }

    [Fact]
    public void Phase1CompletesOnceEveryRunEnded()
    {
        var afterP0 = FinishRun(KhoiDongRound.StartKhoiDong(Players, P1));
        var afterP1 = FinishRun(afterP0);
        Assert.True(KhoiDongRound.Phase1Complete(afterP1));
        Assert.True(afterP1.Runs["p1"].Ended);
    }

    [Fact]
    public void EachPlayersPhase1ScoreIsTheirOwn()
    {
        var s = FinishRun(KhoiDongRound.StartKhoiDong(Players, P1));
        Assert.Equal(60, KhoiDongRound.KhoiDongPoints(s, "p0"));
        Assert.Equal(0, KhoiDongRound.KhoiDongPoints(s, "p1"));
    }

    [Fact]
    public void Phase2_MayBeginEarlyOnlyWhileNothingWasRecorded()
    {
        var s = KhoiDongRound.BeginPhase2(KhoiDongRound.StartKhoiDong(Players, P1), P2);
        Assert.Equal("phase2", s.Stage);
    }

    [Fact]
    public void Phase2_CannotBeginEarlyOnceAnAnswerWasRecorded()
    {
        var touched = KhoiDongRound.RecordOral(
            KhoiDongRound.StartKhoiDong(Players, P1), correct: true, spentS: 5);
        Assert.Equal("PHASE1_INCOMPLETE", CodeOf(() =>
            KhoiDongRound.BeginPhase2(touched, P2)));
    }

    [Fact]
    public void Phase2_BeginsOnceEveryoneFinished()
    {
        var done = FinishRun(FinishRun(KhoiDongRound.StartKhoiDong(Players, P1)));
        var s = KhoiDongRound.BeginPhase2(done, P2);
        Assert.Equal("phase2", s.Stage);
        Assert.Equal(P2, s.Phase2!.QuestionIds);
        Assert.Null(KhoiDongRound.ActivePlayerId(s));
    }

    [Fact]
    public void Phase2_CannotBeginTwice()
    {
        var done = FinishRun(FinishRun(KhoiDongRound.StartKhoiDong(Players, P1)));
        var s = KhoiDongRound.BeginPhase2(done, P2);
        Assert.Equal("WRONG_STAGE", CodeOf(() => KhoiDongRound.BeginPhase2(s, P2)));
    }

    private static KhoiDongState InPhase2()
        => KhoiDongRound.BeginPhase2(
            FinishRun(FinishRun(KhoiDongRound.StartKhoiDong(Players, P1))), P2);

    [Fact]
    public void BangGioOpensWindowAndJudgesPayOnTopOfRuns()
    {
        var s = KhoiDongRound.OpenWindow(InPhase2(), Opened);
        Assert.Equal(Opened, s.Phase2!.OpenedAt);

        s = KhoiDongRound.JudgeCard(s, "p0", true);
        s = KhoiDongRound.JudgeCard(s, "p1", true);
        Assert.Equal(70, KhoiDongRound.KhoiDongPoints(s, "p0"));
        Assert.Equal(70, KhoiDongRound.KhoiDongPoints(s, "p1"));
        Assert.Equal(0, s.Phase2!.Index);
    }

    [Fact]
    public void WrongCardPaysNothingAndRemarkCorrectsTheLedger()
    {
        var s = KhoiDongRound.OpenWindow(InPhase2(), Opened);
        s = KhoiDongRound.JudgeCard(s, "p0", false);
        Assert.Equal(60, KhoiDongRound.KhoiDongPoints(s, "p0"));
        s = KhoiDongRound.JudgeCard(s, "p0", true);
        Assert.Equal(70, KhoiDongRound.KhoiDongPoints(s, "p0"));
    }

    [Fact]
    public void AdvancingMovesCursorAndShutsWindow()
    {
        var s = KhoiDongRound.OpenWindow(InPhase2(), Opened);
        s = KhoiDongRound.NextQuestion(s);
        Assert.Equal(1, s.Phase2!.Index);
        Assert.Null(s.Phase2!.OpenedAt);

        var reopened = KhoiDongRound.OpenWindow(s, Opened);
        Assert.Equal(1, reopened.Phase2!.Index);
        Assert.Equal(Opened, reopened.Phase2!.OpenedAt);
    }

    [Fact]
    public void EndingTheRoundClosesThePhase()
    {
        var s = KhoiDongRound.EndKhoiDong(InPhase2());
        Assert.True(s.Ended);
        Assert.True(s.Phase2!.Closed);
        Assert.Equal("ENDED", CodeOf(() => KhoiDongRound.OpenWindow(s, Opened)));
        Assert.Equal("ENDED", CodeOf(() => KhoiDongRound.JudgeCard(s, "p0", true)));
    }
}
