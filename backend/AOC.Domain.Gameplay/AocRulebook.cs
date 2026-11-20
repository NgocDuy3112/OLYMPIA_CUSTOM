using System.Text.Json;
using AOC.Domain.Contracts;

namespace AOC.Domain.Gameplay;

public static class AocRulebook
{
    public static readonly List<TournamentRound> AocRounds =
    [
        new() { Id = "khoi-dong", Name = "Khởi động", Order = 0, Chart = "bars" },
        new() { Id = "giai-ma", Name = "Giải mã", Order = 1, Chart = "bars" },
        new() { Id = "but-pha", Name = "Bứt phá", Order = 2, Chart = "bars" },
        new() { Id = "ve-dich", Name = "Về đích", Order = 3, Chart = "bars" }
    ];

    private static JsonElement BatchOf(object batch)
        => JsonSerializer.SerializeToElement(batch, RuleBatches.Json);

    private static class ConfigFrom
    {
        public static RoundConfig KhoiDong(RoundRules.KhoiDongRules b) => new()
        {
            AllowedKinds = [QuestionKind.TEXT],
            Scoring = new ScoringRule.Constant(b.PointsPerCorrect),
            Rules = BatchOf(b),
            Turns =
            [
                new TurnConfig
                {
                    Id = "phase1", Mode = QuestionMode.text, Delivery = DeliveryMode.sequential,
                    Flow = Contracts.Flow.rieng, Buckets = ["khoi-dong:rieng"],
                    Window = new WindowSpec
                    {
                        Mode = AnswerMode.Oral, Eligibility = AnswerEligibility.CurrentTurn,
                        Seconds = b.Phase1BudgetS
                    },
                    QuestionCount = b.Phase1Questions, TimeBudgetSeconds = b.Phase1BudgetS
                },
                new TurnConfig
                {
                    Id = "phase2", Mode = QuestionMode.text, Delivery = DeliveryMode.batch,
                    Flow = Contracts.Flow.chung, Buckets = ["khoi-dong:chung"],
                    Window = new WindowSpec
                    {
                        Mode = AnswerMode.Typed, Eligibility = AnswerEligibility.Everyone,
                        Seconds = b.Phase2WindowS
                    },
                    QuestionCount = b.Phase2Questions, TimeLimitSeconds = b.Phase2WindowS
                }
            ]
        };

        public static RoundConfig GiaiMa(RoundRules.GiaiMaRules b) => new()
        {
            AllowedKinds = [QuestionKind.KEYWORD, QuestionKind.HINT],
            Scoring = new ScoringRule.KeywordDerived(b.Start, b.DropPerHint, b.Floor, 0),
            Rules = BatchOf(b),
            Turns =
            [
                new TurnConfig
                {
                    Id = "phase1", Mode = QuestionMode.text, Delivery = DeliveryMode.batch,
                    Flow = Contracts.Flow.chung, Buckets = ["giai-ma"],
                    Window = new WindowSpec
                    {
                        Mode = AnswerMode.Typed, Eligibility = AnswerEligibility.Everyone,
                        Seconds = b.HintWindowS
                    },
                    HintCount = b.HintCount, TimeLimitSeconds = b.HintWindowS
                }
            ]
        };

        public static RoundConfig ButPha(RoundRules.ButPhaRules b) => new()
        {
            AllowedKinds = [QuestionKind.TEXT],
            Scoring = new ScoringRule.RankMultiplier(b.Bands, b.Multipliers, 10, 0, TimeBasis.first),
            Rules = BatchOf(b),
            Turns =
            [
                new TurnConfig
                {
                    Id = "phase1", Mode = QuestionMode.text, Delivery = DeliveryMode.batch,
                    Flow = Contracts.Flow.chung, Buckets = ["but-pha"],
                    Window = new WindowSpec
                    {
                        Mode = AnswerMode.Typed, Eligibility = AnswerEligibility.Everyone,
                        Seconds = b.QuestionLimitS
                    },
                    QuestionCount = b.QuestionCount, TimeLimitSeconds = b.QuestionLimitS
                }
            ]
        };

        public static RoundConfig VeDich(RoundRules.VeDichRules b) => new()
        {
            AllowedKinds = [QuestionKind.TEXT],
            Scoring = new ScoringRule.OutcomeMultipliers(
                b.CorrectPct, b.IncorrectPct,
                new OutcomePowers(new OutcomeStar(b.Star.Correct, b.Star.Incorrect))),
            Rules = BatchOf(b),
            Turns =
            [
                new TurnConfig
                {
                    Id = "phase1", Mode = QuestionMode.text, Delivery = DeliveryMode.pick,
                    Flow = Contracts.Flow.chung, Buckets = ["ve-dich:20", "ve-dich:30"],
                    Window = new WindowSpec
                    {
                        Mode = AnswerMode.Typed, Eligibility = AnswerEligibility.CurrentTurn
                    },
                    PickCount = b.PickCount,
                    SecondsByValue = b.SecondsByValue
                },
                new TurnConfig
                {
                    Id = "phase2", Mode = QuestionMode.oral, Delivery = DeliveryMode.sequential,
                    Flow = Contracts.Flow.rieng, Buckets = ["ve-dich:40", "ve-dich:50"],
                    Window = new WindowSpec
                    {
                        Mode = AnswerMode.Oral, Eligibility = AnswerEligibility.CurrentTurn
                    },
                    BuzzWindowSeconds = b.BuzzWindowS, PickCount = b.PickCount,
                    SecondsByValue = b.SecondsByValue
                }
            ]
        };
    }

    private static readonly Dictionary<string, RoundConfig> Rules = new()
    {
        ["khoi-dong"] = ConfigFrom.KhoiDong(RuleBatches.KhoiDong),
        ["giai-ma"] = ConfigFrom.GiaiMa(RuleBatches.GiaiMa),
        ["but-pha"] = ConfigFrom.ButPha(RuleBatches.ButPha),
        ["ve-dich"] = ConfigFrom.VeDich(RuleBatches.VeDich)
    };

    public static RoundConfig? AocRoundConfig(string roundId)
        => Rules.TryGetValue(roundId, out var config) ? config : null;

    public static Dictionary<string, RoundConfig> ResolveRoundRules(
        IEnumerable<TournamentRound> rounds,
        IReadOnlyDictionary<string, RoundConfig>? saved)
    {
        var resolved = new Dictionary<string, RoundConfig>();
        foreach (var round in rounds)
        {
            var config = saved is not null && saved.TryGetValue(round.Id, out var byId)
                ? byId
                : AocRoundConfig(round.Id);
            if (config is not null) resolved[round.Id] = config;
        }
        return resolved;
    }

    public static bool IsAocRound(string roundId) => Rules.ContainsKey(roundId);
}
