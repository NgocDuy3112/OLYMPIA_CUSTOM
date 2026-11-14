using AOC.Domain.Contracts;
using AOC.Domain.Engine;
using Xunit;

namespace AOC.Tests.Engine;

public class RulesTests
{
    private static RoundConfig Round(Action<RoundConfigBuilder>? configure = null)
    {
        var builder = new RoundConfigBuilder();
        configure?.Invoke(builder);
        return builder.Build();
    }

    private sealed class RoundConfigBuilder
    {
        public List<QuestionKind> AllowedKinds { get; } = [QuestionKind.CHOICE];
        public ScoringRule Scoring { get; set; } = new ScoringRule.Constant(10);
        public List<TurnConfig> Turns { get; set; } =
        [
            new TurnConfig { Id = "phase1", Mode = QuestionMode.text, Delivery = DeliveryMode.batch }
        ];

        public RoundConfig Build() => new()
        {
            AllowedKinds = AllowedKinds,
            Scoring = Scoring,
            Turns = Turns
        };
    }

    [Fact]
    public void Defaults_KhoiDong()
    {
        var rules = RoundRules.ResolveKhoiDong(null);
        Assert.Equal(6, rules.Phase1Questions);
        Assert.Equal(40, rules.Phase1BudgetS);
        Assert.Equal(6, rules.Phase2Questions);
        Assert.Equal(10, rules.Phase2WindowS);
        Assert.Equal(10, rules.PointsPerCorrect);
    }

    [Fact]
    public void Defaults_GiaiMa()
    {
        var rules = RoundRules.ResolveGiaiMa(null);
        Assert.Equal(8, rules.HintCount);
        Assert.Equal(15, rules.HintWindowS);
        Assert.Equal(100, rules.Start);
        Assert.Equal(10, rules.DropPerHint);
        Assert.Equal(20, rules.Floor);
    }

    [Fact]
    public void Defaults_ButPha()
    {
        var rules = RoundRules.ResolveButPha(null);
        Assert.Equal(4, rules.QuestionCount);
        Assert.Equal(30, rules.QuestionLimitS);
        Assert.Equal(new List<SpeedBand> { new(5, 15), new(15, 10), new(30, 5) }, rules.Bands);
        Assert.Equal(new List<int> { 4, 3, 2 }, rules.Multipliers);
        Assert.Equal(1, rules.LateMultiplier);
    }

    [Fact]
    public void Defaults_VeDich()
    {
        var rules = RoundRules.ResolveVeDich(null);
        Assert.Equal(1, rules.CorrectPct);
        Assert.Equal(-0.5, rules.IncorrectPct);
        Assert.Equal(new RoundRules.VeDichStar(1.5, -1), rules.Star);
        Assert.Equal(5, rules.BuzzWindowS);
        Assert.Equal(3, rules.PickCount);
    }

    [Fact]
    public void RulebookWins_KhoiDong()
    {
        var rules = RoundRules.ResolveKhoiDong(Round(b =>
        {
            b.Turns =
            [
                new TurnConfig
                {
                    Id = "phase1", Mode = QuestionMode.oral, Delivery = DeliveryMode.sequential,
                    QuestionCount = 8, TimeBudgetSeconds = 30
                },
                new TurnConfig
                {
                    Id = "phase2", Mode = QuestionMode.text, Delivery = DeliveryMode.batch,
                    QuestionCount = 10, TimeLimitSeconds = 7, BuzzWindowSeconds = 99
                }
            ];
        }));

        Assert.Equal(8, rules.Phase1Questions);
        Assert.Equal(30, rules.Phase1BudgetS);
        Assert.Equal(6, rules.Phase2Questions); // phase2 count is fixed by the format
        Assert.Equal(7, rules.Phase2WindowS);
    }

    [Fact]
    public void RulebookWins_KhoiDongPointsFromConstant()
    {
        var rules = RoundRules.ResolveKhoiDong(Round(b =>
            b.Scoring = new ScoringRule.Constant(25)));
        Assert.Equal(25, rules.PointsPerCorrect);
    }

    [Fact]
    public void RulebookWins_GiaiMaKeywordFromTemplate()
    {
        var rules = RoundRules.ResolveGiaiMa(Round(b =>
        {
            b.Scoring = new ScoringRule.KeywordDerived(200, 25, 50, 0);
            b.Turns =
            [
                new TurnConfig
                {
                    Id = "hints", Mode = QuestionMode.text, Delivery = DeliveryMode.batch,
                    HintCount = 12, TimeLimitSeconds = 20
                }
            ];
        }));

        Assert.Equal(200, rules.Start);
        Assert.Equal(25, rules.DropPerHint);
        Assert.Equal(50, rules.Floor);
        Assert.Equal(12, rules.HintCount);
        Assert.Equal(20, rules.HintWindowS);
    }

    [Fact]
    public void RulebookWins_ButPhaBandsFromTemplate()
    {
        var rules = RoundRules.ResolveButPha(Round(b =>
        {
            b.Scoring = new ScoringRule.RankMultiplier(
                [new SpeedBand(3, 20)], [8, 4], 20, 0, TimeBasis.first);
            b.Turns =
            [
                new TurnConfig
                {
                    Id = "phase1", Mode = QuestionMode.text, Delivery = DeliveryMode.sequential,
                    QuestionCount = 6, TimeLimitSeconds = 20
                }
            ];
        }));

        Assert.Equal(new List<SpeedBand> { new(3, 20) }, rules.Bands);
        Assert.Equal(new List<int> { 8, 4 }, rules.Multipliers);
        Assert.Equal(4, rules.LateMultiplier);
        Assert.Equal(6, rules.QuestionCount);
        Assert.Equal(20, rules.QuestionLimitS);
    }

    [Fact]
    public void RulebookWins_VeDichPercentagesFromTemplate()
    {
        var rules = RoundRules.ResolveVeDich(Round(b =>
        {
            b.Scoring = new ScoringRule.OutcomeMultipliers(2, -1, new OutcomePowers(new OutcomeStar(3, -2)));
            b.Turns =
            [
                new TurnConfig
                {
                    Id = "phase1", Mode = QuestionMode.text, Delivery = DeliveryMode.pick,
                    QuestionCount = 24
                },
                new TurnConfig
                {
                    Id = "phase2", Mode = QuestionMode.oral, Delivery = DeliveryMode.pick,
                    QuestionCount = 24, PickCount = 5, BuzzWindowSeconds = 8
                }
            ];
        }));

        Assert.Equal(2, rules.CorrectPct);
        Assert.Equal(-1, rules.IncorrectPct);
        Assert.Equal(new RoundRules.VeDichStar(3, -2), rules.Star);
        Assert.Equal(5, rules.PickCount);
        Assert.Equal(8, rules.BuzzWindowS);
    }

    [Fact]
    public void MissingNumbersFallBackToFormatDefaults()
    {
        var rules = RoundRules.ResolveGiaiMa(Round(b => b.Scoring = new ScoringRule.Constant(10)));
        Assert.Equal(100, rules.Start);
        Assert.Equal(10, rules.DropPerHint);
    }

    [Fact]
    public void VeDichClock_ReadsFaceValue()
    {
        var rules = RoundRules.ResolveVeDich(null);
        Assert.Equal(15, RoundRules.VeDichClockSeconds(rules, 20));
        Assert.Equal(20, RoundRules.VeDichClockSeconds(rules, 30));
        Assert.Equal(30, RoundRules.VeDichClockSeconds(rules, 40));
        Assert.Equal(45, RoundRules.VeDichClockSeconds(rules, 50));
        Assert.Null(RoundRules.VeDichClockSeconds(rules, 10));
    }

    [Fact]
    public void VeDichClock_PrefersRoundOwnClock()
    {
        var custom = RoundRules.ResolveVeDich(Round(b =>
            b.Turns =
            [
                new TurnConfig
                {
                    Id = "phase1", Mode = QuestionMode.text, Delivery = DeliveryMode.pick,
                    SecondsByValue = new() { ["20"] = 7 }
                }
            ]));
        Assert.Equal(7, RoundRules.VeDichClockSeconds(custom, 20));
        Assert.Equal(20, RoundRules.VeDichClockSeconds(custom, 30));
    }
}
