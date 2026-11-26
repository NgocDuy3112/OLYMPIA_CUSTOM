using AOC.Api.Modules.Matches;
using AOC.Domain.Contracts;
using AOC.Domain.Gameplay.Turns;
using Xunit;

namespace AOC.Tests.Engine;

public class TieBreakGuardTests
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

    private static TieBreakState Open() => TieBreakTurn.OpenBuzz(
        TieBreakTurn.StartTieBreak(["a", "b"], Questions), T0);

    [Fact]
    public void Advance_refuses_while_a_buzz_is_open()
    {
        var open = TieBreakTurn.Buzz(Open(), "a", At(1));

        Assert.Equal("WINDOW_BUSY", CodeOf(() => TieBreakTurn.Advance(open)));
    }

    [Fact]
    public void Advance_refuses_while_the_window_is_locked()
    {
        var locked = TieBreakTurn.LockBuzz(Open());

        Assert.Equal("WINDOW_BUSY", CodeOf(() => TieBreakTurn.Advance(locked)));
    }

    [Fact]
    public void Advance_moves_on_when_the_window_is_settled()
    {
        var next = TieBreakTurn.Advance(Open());

        Assert.Equal("tb2", TieBreakTurn.CurrentQuestionId(next));
        Assert.Null(next.Window.Buzzer);
        Assert.False(next.Window.Locked);
    }

    [Fact]
    public void Judging_a_correct_buzz_still_advances()
    {
        var judged = TieBreakTurn.Judge(TieBreakTurn.Buzz(Open(), "a", At(1)), correct: true);

        Assert.Equal("tb2", TieBreakTurn.CurrentQuestionId(judged));
        Assert.Equal(10, TieBreakTurn.TieBreakScore(judged, "a"));
    }

    [Fact]
    public void Rank_prefers_the_earlier_buzz_when_the_tie_break_score_is_level()
    {
        var ranks = TieBreakTurn.RankWithTieBreak(
            [new RankedEntry("a", 100), new RankedEntry("b", 100)],
            new Dictionary<string, int> { ["a"] = 1, ["b"] = 1 },
            new Dictionary<string, int> { ["a"] = 2400, ["b"] = 900 });

        Assert.Equal(1, ranks["b"]);
        Assert.Equal(2, ranks["a"]);
    }

    [Fact]
    public void Rank_trusts_the_buzz_time_only_when_score_and_tie_break_are_level()
    {
        var ranks = TieBreakTurn.RankWithTieBreak(
            [new RankedEntry("a", 100), new RankedEntry("b", 100)],
            new Dictionary<string, int> { ["a"] = 2, ["b"] = 1 },
            new Dictionary<string, int> { ["a"] = 5000, ["b"] = 200 });

        Assert.Equal(1, ranks["a"]);
        Assert.Equal(2, ranks["b"]);
    }

    [Fact]
    public void Rank_gives_a_player_without_a_buzz_a_worse_place()
    {
        var ranks = TieBreakTurn.RankWithTieBreak(
            [new RankedEntry("a", 100), new RankedEntry("b", 100)],
            null,
            new Dictionary<string, int> { ["a"] = 1200 });

        Assert.Equal(1, ranks["a"]);
        Assert.Equal(2, ranks["b"]);
    }

    [Fact]
    public void A_buzz_records_the_fastest_time_of_each_player()
    {
        var firstBuzz = TieBreakTurn.Buzz(Open(), "a", At(2.5));
        Assert.Equal(2500, firstBuzz.BuzzMs["a"]);

        var fasterBuzz = TieBreakTurn.Buzz(
            TieBreakTurn.OpenBuzz(TieBreakTurn.Judge(firstBuzz, correct: true), T0), "a", At(0.4));
        Assert.Equal(400, fasterBuzz.BuzzMs["a"]);

        var slowerBuzz = TieBreakTurn.Buzz(
            TieBreakTurn.OpenBuzz(TieBreakTurn.Judge(fasterBuzz, correct: true), T0), "a", At(1.1));
        Assert.Equal(400, slowerBuzz.BuzzMs["a"]);
    }

    [Fact]
    public void DenseRanks_prefers_the_earlier_buzz_when_totals_and_tie_breaks_are_level()
    {
        var ranks = MatchScoring.DenseRanks(
            [("a", 90), ("b", 90), ("c", 80)],
            new Dictionary<string, int> { ["a"] = 1, ["b"] = 1 },
            new Dictionary<string, int> { ["a"] = 3000, ["b"] = 700 });

        Assert.Equal(1, ranks["b"]);
        Assert.Equal(2, ranks["a"]);
        Assert.Equal(3, ranks["c"]);
    }

    [Fact]
    public void BuildMatchResults_uses_the_buzz_time_as_the_last_comparator()
    {
        var results = MatchScoring.BuildMatchResults(new MatchScoring.MatchResultInput(
            ["a", "b"],
            [
                new MatchScoring.AnswerForScoring("a", "tiebreak", 10),
                new MatchScoring.AnswerForScoring("b", "tiebreak", 10)
            ],
            TieBreak: new Dictionary<string, int> { ["a"] = 1, ["b"] = 1 },
            BuzzMs: new Dictionary<string, int> { ["a"] = 2800, ["b"] = 600 }));

        Assert.Equal("b", results[0].UserId);
        Assert.Equal(1, results[0].Rank);
        Assert.Equal(2, results.First(r => r.UserId == "a").Rank);
    }
}
