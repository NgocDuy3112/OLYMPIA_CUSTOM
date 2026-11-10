using Olympia.Domain.Engine;
using Olympia.Domain.Engine.Turns;
using Xunit;

namespace Olympia.Tests.Engine;

public class TieBreakTests
{
    private static readonly string[] Questions = ["tb1", "tb2"];

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
    public void NeedsAtLeastTwoDistinctPlayersAndOneQuestion()
    {
        Assert.Equal("VALIDATION", CodeOf(() => TieBreakTurn.StartTieBreak(["a"], Questions)));
        Assert.Equal("VALIDATION", CodeOf(() => TieBreakTurn.StartTieBreak(["a", "a"], Questions)));
        Assert.Equal("VALIDATION", CodeOf(() => TieBreakTurn.StartTieBreak(["a", "b"], [])));
        Assert.Equal(new List<string> { "a", "b" },
            TieBreakTurn.StartTieBreak(["a", "b"], Questions).Players);
    }

    [Fact]
    public void SubmitsOnlyThroughAnOpenWindowForTiedPlayers()
    {
        var s = TieBreakTurn.StartTieBreak(["a", "b"], Questions);
        Assert.Equal("WINDOW_CLOSED", CodeOf(() => TieBreakTurn.Submit(s, "a", "42")));

        s = TieBreakTurn.OpenWindow(s);
        s = TieBreakTurn.Submit(s, "a", "42");
        Assert.Equal("NOT_A_TIED_PLAYER", CodeOf(() => TieBreakTurn.Submit(s, "c", "x")));

        s = TieBreakTurn.CloseWindow(s);
        Assert.Equal("WINDOW_CLOSED", CodeOf(() => TieBreakTurn.Submit(s, "a", "43")));
        Assert.Equal("42", s.Answers["a"]["tb1"].Text);
        Assert.Null(s.Answers["a"]["tb1"].Correct);
    }

    [Fact]
    public void FinalizingClosesTheWindowAndRecordsVerdicts()
    {
        var s = TieBreakTurn.StartTieBreak(["a", "b"], Questions);
        s = TieBreakTurn.OpenWindow(s);
        s = TieBreakTurn.Submit(s, "a", "42");
        s = TieBreakTurn.Submit(s, "b", "41");
        s = TieBreakTurn.Finalize(s, [("a", true), ("b", false)]);

        Assert.False(s.Open);
        Assert.Equal(10, TieBreakTurn.TieBreakScore(s, "a"));
        Assert.Equal(0, TieBreakTurn.TieBreakScore(s, "b"));
        Assert.Equal("WINDOW_CLOSED", CodeOf(() => TieBreakTurn.Finalize(s, [])));
    }

    [Fact]
    public void WalksQuestionsInOrderThenEnds()
    {
        var s = TieBreakTurn.StartTieBreak(["a", "b"], Questions);
        Assert.Equal("tb1", TieBreakTurn.CurrentQuestionId(s));
        Assert.Equal("QUESTION_IN_PLAY", CodeOf(() => TieBreakTurn.NextQuestion(s)));

        s = TieBreakTurn.OpenWindow(s);
        Assert.Equal("QUESTION_IN_PLAY", CodeOf(() => TieBreakTurn.NextQuestion(s)));

        s = TieBreakTurn.Finalize(s, [("a", true), ("b", true)]);
        s = TieBreakTurn.NextQuestion(s);
        Assert.Equal("tb2", TieBreakTurn.CurrentQuestionId(s));

        s = TieBreakTurn.OpenWindow(s);
        s = TieBreakTurn.CloseWindow(s);
        Assert.Equal("QUESTIONS_UNJUDGED", CodeOf(() => TieBreakTurn.EndTieBreak(s)));

        s = TieBreakTurn.OpenWindow(s);
        s = TieBreakTurn.Finalize(s, [("a", false), ("b", true)]);
        s = TieBreakTurn.EndTieBreak(s);
        Assert.True(s.Ended);
        Assert.Equal(10, TieBreakTurn.TieBreakScore(s, "a"));
        Assert.Equal(20, TieBreakTurn.TieBreakScore(s, "b"));
        Assert.Equal("ENDED", CodeOf(() => TieBreakTurn.Submit(TieBreakTurn.OpenWindow(s), "a", "x")));
    }

    [Fact]
    public void EmptyVerdictSetLeavesQuestionUnjudged()
    {
        var s = TieBreakTurn.StartTieBreak(["a", "b"], Questions);
        s = TieBreakTurn.OpenWindow(s);
        s = TieBreakTurn.Finalize(s, []);
        Assert.Equal("QUESTION_IN_PLAY", CodeOf(() => TieBreakTurn.NextQuestion(s)));
        Assert.Equal("QUESTIONS_UNJUDGED", CodeOf(() => TieBreakTurn.EndTieBreak(s)));
    }

    private static readonly List<RankedEntry> Entries =
    [
        new("a", 100),
        new("b", 100),
        new("c", 90)
    ];

    [Fact]
    public void RankWithoutTieBreak_SharesTiedRank()
    {
        var ranks = TieBreakTurn.RankWithTieBreak(Entries, null);
        Assert.Equal(1, ranks["a"]);
        Assert.Equal(1, ranks["b"]);
        Assert.Equal(2, ranks["c"]);
    }

    [Fact]
    public void RankWithScores_OrdersTheTiedPair()
    {
        var ranks = TieBreakTurn.RankWithTieBreak(Entries,
            new Dictionary<string, int> { ["a"] = 10, ["b"] = 0 });
        Assert.Equal(1, ranks["a"]);
        Assert.Equal(2, ranks["b"]);
        Assert.Equal(3, ranks["c"]);
    }

    [Fact]
    public void UnresolvedTie_StaysShared()
    {
        var ranks = TieBreakTurn.RankWithTieBreak(Entries,
            new Dictionary<string, int> { ["a"] = 10, ["b"] = 10 });
        Assert.Equal(1, ranks["a"]);
        Assert.Equal(1, ranks["b"]);
        Assert.Equal(2, ranks["c"]);
    }

    [Fact]
    public void AbsentPlayersScoreZero()
    {
        var ranks = TieBreakTurn.RankWithTieBreak(Entries,
            new Dictionary<string, int> { ["a"] = 5 });
        Assert.Equal(1, ranks["a"]);
        Assert.Equal(2, ranks["b"]);
        Assert.Equal(3, ranks["c"]);
    }

    [Fact]
    public void TotalsAreReadNeverRewritten()
    {
        TieBreakTurn.RankWithTieBreak(Entries, new Dictionary<string, int> { ["b"] = 999 });
        Assert.Equal(new[] { 100, 100, 90 }, Entries.Select(e => e.TotalScore));
    }
}
