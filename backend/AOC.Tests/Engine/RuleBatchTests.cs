using System.Text.Json;
using AOC.Domain.Contracts;
using AOC.Domain.Gameplay;
using AOC.Domain.Gameplay.Scoring;
using Xunit;

namespace AOC.Tests.Engine;

public class RuleBatchTests
{
    [Fact]
    public void Seeds_CarryAVersion()
    {
        Assert.Equal("v1", RuleBatches.KhoiDong.Version);
        Assert.Equal("v1", RuleBatches.GiaiMa.Version);
        Assert.Equal("v1", RuleBatches.ButPha.Version);
        Assert.Equal("v1", RuleBatches.VeDich.Version);
    }

    [Fact]
    public void CanonicalRulebookConfigs_ShipTheirBatch()
    {
        foreach (var round in AocRulebook.AocRounds)
        {
            var config = AocRulebook.AocRoundConfig(round.Id);
            Assert.NotNull(config);
            Assert.NotNull(config!.Rules);
        }
    }

    [Fact]
    public void Resolve_PrefersTheBatchJsonOverTheSeed()
    {
        var batch = RuleBatches.VeDich with { Version = "v2-test", PickCount = 7 };
        var config = new RoundConfig
        {
            AllowedKinds = [QuestionKind.TEXT],
            Scoring = new ScoringRule.OutcomeMultipliers(
                1, -0.5, new OutcomePowers(new OutcomeStar(1.5, -1))),
            Turns = [],
            Rules = JsonSerializer.SerializeToElement(batch, RuleBatches.Json)
        };

        var resolved = RoundRules.ResolveVeDich(config);

        Assert.Equal(7, resolved.PickCount);
        Assert.Equal("v2-test", resolved.Version);
    }

    [Fact]
    public void Resolve_WithoutAnyConfig_ReturnsTheSeedBatch()
    {
        Assert.Same(RuleBatches.VeDich, RoundRules.ResolveVeDich(null));
        Assert.Same(RuleBatches.KhoiDong, RoundRules.ResolveKhoiDong(null));
        Assert.Same(RuleBatches.GiaiMa, RoundRules.ResolveGiaiMa(null));
        Assert.Same(RuleBatches.ButPha, RoundRules.ResolveButPha(null));
    }

    [Fact]
    public void ConfigWithoutBatch_StillOverridesTheSeed()
    {
        var config = new RoundConfig
        {
            AllowedKinds = [QuestionKind.TEXT],
            Scoring = new ScoringRule.Constant(25),
            Turns = [new TurnConfig
            {
                Id = "legacy", Flow = Flow.rieng, Mode = QuestionMode.text, Delivery = DeliveryMode.batch,
                QuestionCount = 9
            }]
        };

        var resolved = RoundRules.ResolveKhoiDong(config);

        Assert.Equal(25, resolved.PointsPerCorrect);
        Assert.Equal(9, resolved.Phase1Questions);
        Assert.Equal("v1", resolved.Version);
    }

    [Fact]
    public void ConfigWithoutFlowFallsBackToTheSeed()
    {
        var config = new RoundConfig
        {
            AllowedKinds = [QuestionKind.TEXT],
            Scoring = new ScoringRule.Constant(25),
            Turns = [new TurnConfig
            {
                Id = "phase1", Mode = QuestionMode.text, Delivery = DeliveryMode.batch,
                QuestionCount = 9
            }]
        };

        var resolved = RoundRules.ResolveKhoiDong(config);

        Assert.Equal(25, resolved.PointsPerCorrect);
        Assert.Equal(RuleBatches.KhoiDong.Phase1Questions, resolved.Phase1Questions);
    }

    [Fact]
    public void BatchJson_RoundTripsEveryField()
    {
        var json = JsonSerializer.SerializeToElement(RuleBatches.VeDich, RuleBatches.Json);
        var back = json.Deserialize<RoundRules.VeDichRules>(RuleBatches.Json);

        Assert.NotNull(back);
        Assert.Equal(RuleBatches.VeDich.Version, back!.Version);
        Assert.Equal(RuleBatches.VeDich.CorrectPct, back.CorrectPct);
        Assert.Equal(RuleBatches.VeDich.IncorrectPct, back.IncorrectPct);
        Assert.Equal(RuleBatches.VeDich.Star, back.Star);
        Assert.Equal(RuleBatches.VeDich.BuzzWindowS, back.BuzzWindowS);
        Assert.Equal(RuleBatches.VeDich.PickCount, back.PickCount);
        Assert.Equal(4, back.SecondsByValue.Count);
        Assert.Equal(45, back.SecondsByValue[50]);
        Assert.Equal(1, back.Assign.BuzzerCorrect);
        Assert.Equal(-0.5, back.Assign.NobodyBuzzed);
    }

    [Fact]
    public void AssignPayouts_ComeFromTheBatchJson()
    {
        var batch = RuleBatches.VeDich with
        {
            Assign = new RoundRules.VeDichAssign(2, -1, -1, 0, -1)
        };
        var config = new RoundConfig
        {
            AllowedKinds = [QuestionKind.TEXT],
            Scoring = new ScoringRule.OutcomeMultipliers(
                1, -0.5, new OutcomePowers(new OutcomeStar(1.5, -1))),
            Turns = [],
            Rules = JsonSerializer.SerializeToElement(batch, RuleBatches.Json)
        };

        var resolved = RoundRules.ResolveVeDich(config);

        Assert.Equal(2, resolved.Assign.BuzzerCorrect);
        var payout = VeDichScoring.Assign(30, true, resolved.Assign);
        Assert.Equal(60, payout.Buzzer);
        Assert.Equal(-30, payout.Partner);
    }

    [Fact]
    public void BatchJsonFromBeforeAssignExisted_FallsBackToTheSeed()
    {
        using var doc = JsonDocument.Parse(
            "{\"version\":\"v1\",\"correctPct\":1,\"incorrectPct\":-0.5," +
            "\"star\":{\"correct\":1.5,\"incorrect\":-1},\"buzzWindowS\":5,\"pickCount\":3," +
            "\"secondsByValue\":{\"20\":15,\"30\":20,\"40\":30,\"50\":45}}");
        var config = new RoundConfig
        {
            AllowedKinds = [QuestionKind.TEXT],
            Scoring = new ScoringRule.OutcomeMultipliers(
                1, -0.5, new OutcomePowers(new OutcomeStar(1.5, -1))),
            Turns = [],
            Rules = doc.RootElement.Clone()
        };

        var resolved = RoundRules.ResolveVeDich(config);

        Assert.Equal(-0.5, resolved.Assign.NobodyBuzzed);
        Assert.Equal(5, resolved.BuzzWindowS);
    }
}
