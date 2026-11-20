using AOC.Domain.Gameplay;
using Xunit;

namespace AOC.Tests.Engine;

public class AocRulebookTests
{
    [Fact]
    public void TheFourRounds_InPlayingOrder()
    {
        Assert.Equal(
            new[] { "khoi-dong", "giai-ma", "but-pha", "ve-dich" },
            AocRulebook.AocRounds.Select(r => r.Id));
        Assert.Equal(new[] { 0, 1, 2, 3 }, AocRulebook.AocRounds.Select(r => r.Order));
    }

    [Fact]
    public void EachRound_HasACanonicalRulebookEntry()
    {
        foreach (var round in AocRulebook.AocRounds)
        {
            Assert.NotNull(AocRulebook.AocRoundConfig(round.Id));
            Assert.True(AocRulebook.IsAocRound(round.Id));
        }
    }

    [Fact]
    public void KnowsNothingAboutAnUnknownRound()
    {
        Assert.Null(AocRulebook.AocRoundConfig("khong-ton-tai"));
        Assert.False(AocRulebook.IsAocRound("khong-ton-tai"));
    }

    [Fact]
    public void CanonicalRules_ResolveToEngineDefaults()
    {
        var khoiDong = RoundRules.ResolveKhoiDong(AocRulebook.AocRoundConfig("khoi-dong"));
        Assert.Equal(RuleBatches.KhoiDong.Phase1Questions, khoiDong.Phase1Questions);
        Assert.Equal(RuleBatches.KhoiDong.Phase1BudgetS, khoiDong.Phase1BudgetS);
        Assert.Equal(RuleBatches.KhoiDong.Phase2Questions, khoiDong.Phase2Questions);
        Assert.Equal(RuleBatches.KhoiDong.Phase2WindowS, khoiDong.Phase2WindowS);
        Assert.Equal(RuleBatches.KhoiDong.PointsPerCorrect, khoiDong.PointsPerCorrect);

        var giaiMa = RoundRules.ResolveGiaiMa(AocRulebook.AocRoundConfig("giai-ma"));
        Assert.Equal(RuleBatches.GiaiMa.HintCount, giaiMa.HintCount);
        Assert.Equal(RuleBatches.GiaiMa.HintWindowS, giaiMa.HintWindowS);
        Assert.Equal(RuleBatches.GiaiMa.Start, giaiMa.Start);
        Assert.Equal(RuleBatches.GiaiMa.DropPerHint, giaiMa.DropPerHint);
        Assert.Equal(RuleBatches.GiaiMa.Floor, giaiMa.Floor);

        var butPha = RoundRules.ResolveButPha(AocRulebook.AocRoundConfig("but-pha"));
        Assert.Equal(RuleBatches.ButPha.QuestionCount, butPha.QuestionCount);
        Assert.Equal(RuleBatches.ButPha.QuestionLimitS, butPha.QuestionLimitS);
        Assert.Equal(RuleBatches.ButPha.Bands, butPha.Bands);
        Assert.Equal(RuleBatches.ButPha.Multipliers, butPha.Multipliers);
        Assert.Equal(RuleBatches.ButPha.LateMultiplier, butPha.LateMultiplier);

        var veDich = RoundRules.ResolveVeDich(AocRulebook.AocRoundConfig("ve-dich"));
        Assert.Equal(RuleBatches.VeDich.CorrectPct, veDich.CorrectPct);
        Assert.Equal(RuleBatches.VeDich.IncorrectPct, veDich.IncorrectPct);
        Assert.Equal(RuleBatches.VeDich.Star, veDich.Star);
        Assert.Equal(RuleBatches.VeDich.BuzzWindowS, veDich.BuzzWindowS);
        Assert.Equal(RuleBatches.VeDich.PickCount, veDich.PickCount);
    }

    [Fact]
    public void QuestionKinds_MatchWhatTheEngineDealsIn()
    {
        Assert.Equal([Domain.Contracts.QuestionKind.TEXT],
            AocRulebook.AocRoundConfig("khoi-dong")!.AllowedKinds);
        Assert.Equal(
            new[] { Domain.Contracts.QuestionKind.KEYWORD, Domain.Contracts.QuestionKind.HINT },
            AocRulebook.AocRoundConfig("giai-ma")!.AllowedKinds);
        Assert.Equal([Domain.Contracts.QuestionKind.TEXT],
            AocRulebook.AocRoundConfig("but-pha")!.AllowedKinds);
        Assert.Equal([Domain.Contracts.QuestionKind.TEXT],
            AocRulebook.AocRoundConfig("ve-dich")!.AllowedKinds);
    }
}
