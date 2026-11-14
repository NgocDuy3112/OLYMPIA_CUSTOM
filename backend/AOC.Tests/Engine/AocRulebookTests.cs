using AOC.Domain.Engine;
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
        Assert.Equal(RoundRules.Defaults.KhoiDong.Phase1Questions, khoiDong.Phase1Questions);
        Assert.Equal(RoundRules.Defaults.KhoiDong.Phase1BudgetS, khoiDong.Phase1BudgetS);
        Assert.Equal(RoundRules.Defaults.KhoiDong.Phase2Questions, khoiDong.Phase2Questions);
        Assert.Equal(RoundRules.Defaults.KhoiDong.Phase2WindowS, khoiDong.Phase2WindowS);
        Assert.Equal(RoundRules.Defaults.KhoiDong.PointsPerCorrect, khoiDong.PointsPerCorrect);

        var giaiMa = RoundRules.ResolveGiaiMa(AocRulebook.AocRoundConfig("giai-ma"));
        Assert.Equal(RoundRules.Defaults.GiaiMa.HintCount, giaiMa.HintCount);
        Assert.Equal(RoundRules.Defaults.GiaiMa.HintWindowS, giaiMa.HintWindowS);
        Assert.Equal(RoundRules.Defaults.GiaiMa.Start, giaiMa.Start);
        Assert.Equal(RoundRules.Defaults.GiaiMa.DropPerHint, giaiMa.DropPerHint);
        Assert.Equal(RoundRules.Defaults.GiaiMa.Floor, giaiMa.Floor);

        var butPha = RoundRules.ResolveButPha(AocRulebook.AocRoundConfig("but-pha"));
        Assert.Equal(RoundRules.Defaults.ButPha.QuestionCount, butPha.QuestionCount);
        Assert.Equal(RoundRules.Defaults.ButPha.QuestionLimitS, butPha.QuestionLimitS);
        Assert.Equal(RoundRules.Defaults.ButPha.Bands, butPha.Bands);
        Assert.Equal(RoundRules.Defaults.ButPha.Multipliers, butPha.Multipliers);
        Assert.Equal(RoundRules.Defaults.ButPha.LateMultiplier, butPha.LateMultiplier);

        var veDich = RoundRules.ResolveVeDich(AocRulebook.AocRoundConfig("ve-dich"));
        Assert.Equal(RoundRules.Defaults.VeDich.CorrectPct, veDich.CorrectPct);
        Assert.Equal(RoundRules.Defaults.VeDich.IncorrectPct, veDich.IncorrectPct);
        Assert.Equal(RoundRules.Defaults.VeDich.Star, veDich.Star);
        Assert.Equal(RoundRules.Defaults.VeDich.BuzzWindowS, veDich.BuzzWindowS);
        Assert.Equal(RoundRules.Defaults.VeDich.PickCount, veDich.PickCount);
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
