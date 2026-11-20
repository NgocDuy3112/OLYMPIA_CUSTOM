using AOC.Domain.Gameplay;
using AOC.Domain.Gameplay.Scoring;
using Xunit;

namespace AOC.Tests.Engine;

public class ScoringTests
{
    [Fact]
    public void KhoiDong_Awards10ForCorrect0Otherwise()
    {
        Assert.Equal(10, KhoiDongScoring.Points(true, RuleBatches.KhoiDong.PointsPerCorrect));
        Assert.Equal(0, KhoiDongScoring.Points(false, RuleBatches.KhoiDong.PointsPerCorrect));
    }

    [Fact]
    public void GiaiMa_StartsAt100AndDrops10PerHint()
    {
        Assert.Equal(100, RuleBatches.GiaiMa.Start);
        Assert.Equal(10, RuleBatches.GiaiMa.DropPerHint);
        var rules = new GiaiMaScoring.KeywordRules(100, 10, 20);
        Assert.Equal(100, GiaiMaScoring.KeywordValue(0, rules));
        Assert.Equal(90, GiaiMaScoring.KeywordValue(1, rules));
        Assert.Equal(80, GiaiMaScoring.KeywordValue(2, rules));
    }

    [Fact]
    public void GiaiMa_KeywordWorthCurrentValueWhenCorrect0WhenWrong()
    {
        var rules = new GiaiMaScoring.KeywordRules(100, 10, 20);
        Assert.Equal(80, GiaiMaScoring.KeywordAnswerPoints(2, true, rules));
        Assert.Equal(0, GiaiMaScoring.KeywordAnswerPoints(2, false, rules));
    }

    [Fact]
    public void GiaiMa_All8HintsRevealedLeaves20()
    {
        var rules = new GiaiMaScoring.KeywordRules(100, 10, 20);
        Assert.Equal(20, GiaiMaScoring.KeywordValue(8, rules));
    }

    [Theory]
    [InlineData(0, 15)]
    [InlineData(3, 15)]
    [InlineData(9.99, 15)]
    [InlineData(10, 10)]
    [InlineData(14, 10)]
    [InlineData(19.99, 10)]
    [InlineData(20, 5)]
    [InlineData(22, 5)]
    [InlineData(30, 5)]
    public void ButPha_BasePointsByTime(double seconds, int expected)
    {
        var rules = RuleBatches.ButPha;
        Assert.Equal(expected, ButPhaScoring.BasePointsForTime(seconds, rules.Bands));
    }

    [Theory]
    [InlineData(1, 4)]
    [InlineData(2, 3)]
    [InlineData(3, 2)]
    [InlineData(4, 1)]
    [InlineData(5, 1)]
    [InlineData(12, 1)]
    public void ButPha_SpeedMultiplier(int order, int expected)
    {
        var rules = RuleBatches.ButPha;
        Assert.Equal(expected, ButPhaScoring.SpeedMultiplier(order, rules.AsSpeedBands()));
    }

    [Fact]
    public void ButPha_RejectsOrderBelow1()
    {
        var rules = RuleBatches.ButPha;
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            ButPhaScoring.SpeedMultiplier(0, rules.AsSpeedBands()));
    }

    [Fact]
    public void VeDich_AssignPayoutsFollowTheBatch()
    {
        var assign = RuleBatches.VeDich.Assign;

        var right = VeDichScoring.Assign(30, true, assign);
        Assert.Equal(30, right.Buzzer);
        Assert.Equal(-15, right.Partner);

        var wrong = VeDichScoring.Assign(30, false, assign);
        Assert.Equal(-15, wrong.Buzzer);
        Assert.Equal(0, wrong.Partner);

        var none = VeDichScoring.Assign(30, null, assign);
        Assert.Equal(-15, none.Buzzer);
        Assert.Equal(-15, none.Partner);
    }

    [Fact]
    public void ButPha_WorkedExample()
    {
        var rules = RuleBatches.ButPha;
        var speed = rules.AsSpeedBands();
        Assert.Equal(60, ButPhaScoring.Points(true, 3, 1, speed));
        Assert.Equal(45, ButPhaScoring.Points(true, 7, 2, speed));
        Assert.Equal(20, ButPhaScoring.Points(true, 12, 3, speed));
        Assert.Equal(5, ButPhaScoring.Points(true, 20, 4, speed));
        Assert.Equal(0, ButPhaScoring.Points(false, 1, 1, speed));
    }

    [Fact]
    public void VeDich_PercentagesOnFaceValue()
    {
        var rules = RuleBatches.VeDich;
        Assert.Equal(30, VeDichScoring.Points(30, true, rules));
        Assert.Equal(-15, VeDichScoring.Points(30, false, rules));
        Assert.Equal(20, VeDichScoring.Points(20, true, rules));
        Assert.Equal(-20, VeDichScoring.Points(40, false, rules));
        Assert.Equal(-25, VeDichScoring.Points(50, false, rules));
    }

    [Fact]
    public void VeDich_StarMultipliers()
    {
        var rules = RuleBatches.VeDich;
        Assert.Equal(45, VeDichScoring.Points(30, true, rules, star: true));
        Assert.Equal(-30, VeDichScoring.Points(30, false, rules, star: true));
    }
}
