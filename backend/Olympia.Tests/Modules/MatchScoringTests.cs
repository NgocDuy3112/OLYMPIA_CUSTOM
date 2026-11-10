using Olympia.Api.Modules.Matches;
using Xunit;

namespace Olympia.Tests.Modules;

public class MatchScoringTests
{
    [Fact]
    public void DenseRanks_ShareAndAdvance()
    {
        var ranks = MatchScoring.DenseRanks(
        [
            ("a", 100), ("b", 90), ("c", 90), ("d", 80)
        ]);
        Assert.Equal(1, ranks["a"]);
        Assert.Equal(2, ranks["b"]);
        Assert.Equal(2, ranks["c"]);
        Assert.Equal(3, ranks["d"]);
    }

    [Fact]
    public void DenseRanks_EveryoneTiedSharesRank1()
    {
        var ranks = MatchScoring.DenseRanks([("a", 50), ("b", 50)]);
        Assert.Equal(1, ranks["a"]);
        Assert.Equal(1, ranks["b"]);
    }

    [Fact]
    public void DenseRanks_NegativesBelowZero()
    {
        var ranks = MatchScoring.DenseRanks([("a", 0), ("b", -15), ("c", 10)]);
        Assert.Equal(1, ranks["c"]);
        Assert.Equal(2, ranks["a"]);
        Assert.Equal(3, ranks["b"]);
    }

    [Fact]
    public void DenseRanks_EmptyFieldHasNoRanks()
    {
        Assert.Empty(MatchScoring.DenseRanks([]));
    }

    [Fact]
    public void Build_SumsPerRoundAndOverall()
    {
        var results = MatchScoring.BuildMatchResults(new MatchScoring.MatchResultInput(
            ["a", "b"],
            [
                new MatchScoring.AnswerForScoring("a", "giai-ma", 80),
                new MatchScoring.AnswerForScoring("a", "but-pha", 60),
                new MatchScoring.AnswerForScoring("b", "but-pha", 30)
            ]));

        var a = results.First(r => r.UserId == "a");
        var b = results.First(r => r.UserId == "b");
        Assert.Equal("user", a.Kind);
        Assert.Equal(140, a.TotalScore);
        Assert.Equal(80, a.RoundScores["giai-ma"]);
        Assert.Equal(60, a.RoundScores["but-pha"]);
        Assert.Equal(30, b.TotalScore);
        Assert.Equal(2, b.Rank);
        Assert.Equal(new Dictionary<string, int> { ["but-pha"] = 30 }, b.RoundScores);
    }

    [Fact]
    public void Build_CompetitorWithNoAnswersGetsZero()
    {
        var results = MatchScoring.BuildMatchResults(new MatchScoring.MatchResultInput(
            ["a", "b"],
            [new MatchScoring.AnswerForScoring("a", "giai-ma", 10)]));
        var b = results.First(r => r.UserId == "b");
        Assert.Equal(0, b.TotalScore);
        Assert.Empty(b.RoundScores);
    }

    [Fact]
    public void Build_SignedPointsSummedAsIs()
    {
        var results = MatchScoring.BuildMatchResults(new MatchScoring.MatchResultInput(
            ["a"],
            [
                new MatchScoring.AnswerForScoring("a", "ve-dich", 50),
                new MatchScoring.AnswerForScoring("a", "ve-dich", -25)
            ]));
        Assert.Equal(25, results[0].TotalScore);
        Assert.Equal(25, results[0].RoundScores["ve-dich"]);
    }

    [Fact]
    public void Build_NonCompetitorAnswersIgnored()
    {
        var results = MatchScoring.BuildMatchResults(new MatchScoring.MatchResultInput(
            ["a"],
            [
                new MatchScoring.AnswerForScoring("a", "giai-ma", 10),
                new MatchScoring.AnswerForScoring("stranger", "giai-ma", 999)
            ]));
        Assert.Single(results);
        Assert.Equal(10, results[0].TotalScore);
    }

    [Fact]
    public void Build_OrderedByRankThenUserId()
    {
        var results = MatchScoring.BuildMatchResults(new MatchScoring.MatchResultInput(
            ["z", "a"],
            [
                new MatchScoring.AnswerForScoring("z", "giai-ma", 50),
                new MatchScoring.AnswerForScoring("a", "giai-ma", 50)
            ]));
        Assert.Equal(["a", "z"], results.Select(r => r.UserId));
    }

    [Fact]
    public void Build_AdjustmentsJoinTotalsBeforeRanking()
    {
        var results = MatchScoring.BuildMatchResults(new MatchScoring.MatchResultInput(
            ["a", "b"],
            [
                new MatchScoring.AnswerForScoring("a", "but-pha", 30),
                new MatchScoring.AnswerForScoring("b", "but-pha", 40)
            ],
            new Dictionary<string, int> { ["a"] = 20, ["b"] = -15 }));

        var a = results.First(r => r.UserId == "a");
        var b = results.First(r => r.UserId == "b");
        Assert.Equal(50, a.TotalScore);
        Assert.Equal(1, a.Rank);
        Assert.Equal(25, b.TotalScore);
        Assert.Equal(2, b.Rank);
        Assert.Equal(new Dictionary<string, int> { ["but-pha"] = 30 }, a.RoundScores);
        Assert.Equal(new Dictionary<string, int> { ["but-pha"] = 40 }, b.RoundScores);
    }

    [Fact]
    public void Build_NegativeCorrectionBelowZeroStillRanksLast()
    {
        var results = MatchScoring.BuildMatchResults(new MatchScoring.MatchResultInput(
            ["a", "b"],
            [new MatchScoring.AnswerForScoring("b", "khoi-dong", 10)],
            new Dictionary<string, int> { ["a"] = -50 }));

        Assert.Equal(
            new[] { ("b", 10, 1), ("a", -50, 2) },
            results.Select(r => (r.UserId, r.TotalScore, r.Rank)));
    }

    [Fact]
    public void Build_CorrectionForNonCompetitorIgnored()
    {
        var results = MatchScoring.BuildMatchResults(new MatchScoring.MatchResultInput(
            ["a"],
            [],
            new Dictionary<string, int> { ["ghost"] = 99 }));
        Assert.Single(results);
        Assert.Equal("a", results[0].UserId);
        Assert.Equal(0, results[0].TotalScore);
    }
}
