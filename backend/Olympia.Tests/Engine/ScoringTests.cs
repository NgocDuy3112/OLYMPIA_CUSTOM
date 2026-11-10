using Olympia.Domain.Engine;
using Olympia.Domain.Engine.Scoring;
using Xunit;

namespace Olympia.Tests.Engine;

public class ScoringTests
{
    [Fact]
    public void KhoiDong_Awards10ForCorrect0Otherwise()
    {
        Assert.Equal(10, KhoiDongScoring.Points(true, RoundRules.Defaults.KhoiDong.PointsPerCorrect));
        Assert.Equal(0, KhoiDongScoring.Points(false, RoundRules.Defaults.KhoiDong.PointsPerCorrect));
    }

    [Fact]
    public void GiaiMa_StartsAt100AndDrops10PerHint()
    {
        Assert.Equal(100, RoundRules.Defaults.GiaiMa.Start);
        Assert.Equal(10, RoundRules.Defaults.GiaiMa.DropPerHint);
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
    [InlineData(4.99, 15)]
    [InlineData(5, 10)]
    [InlineData(10, 10)]
    [InlineData(14.99, 10)]
    [InlineData(15, 5)]
    [InlineData(22, 5)]
    [InlineData(30, 5)]
    public void ButPha_BasePointsByTime(double seconds, int expected)
    {
        var rules = RoundRules.DefaultButPha();
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
        var rules = RoundRules.DefaultButPha();
        Assert.Equal(expected, ButPhaScoring.SpeedMultiplier(order, rules.AsSpeedBands()));
    }

    [Fact]
    public void ButPha_RejectsOrderBelow1()
    {
        var rules = RoundRules.DefaultButPha();
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            ButPhaScoring.SpeedMultiplier(0, rules.AsSpeedBands()));
    }

    [Fact]
    public void ButPha_WorkedExample()
    {
        var rules = RoundRules.DefaultButPha();
        var speed = rules.AsSpeedBands();
        Assert.Equal(60, ButPhaScoring.Points(true, 3, 1, speed));
        Assert.Equal(30, ButPhaScoring.Points(true, 7, 2, speed));
        Assert.Equal(20, ButPhaScoring.Points(true, 12, 3, speed));
        Assert.Equal(5, ButPhaScoring.Points(true, 20, 4, speed));
        Assert.Equal(0, ButPhaScoring.Points(false, 1, 1, speed));
    }

    [Fact]
    public void VeDich_PercentagesOnFaceValue()
    {
        var rules = RoundRules.DefaultVeDich();
        Assert.Equal(30, VeDichScoring.Points(30, true, rules));
        Assert.Equal(-15, VeDichScoring.Points(30, false, rules));
        Assert.Equal(20, VeDichScoring.Points(20, true, rules));
        Assert.Equal(-20, VeDichScoring.Points(40, false, rules));
        Assert.Equal(-25, VeDichScoring.Points(50, false, rules));
    }

    [Fact]
    public void VeDich_StarMultipliers()
    {
        var rules = RoundRules.DefaultVeDich();
        Assert.Equal(45, VeDichScoring.Points(30, true, rules, star: true));
        Assert.Equal(-30, VeDichScoring.Points(30, false, rules, star: true));
    }
}
