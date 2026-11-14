using AOC.Domain.Contracts;

namespace AOC.Domain.Engine;

/// <summary>Port of engine/aoc-rulebook.ts — the built-in AOC rulebook.</summary>
public static class AocRulebook
{
    public static readonly List<TournamentRound> AocRounds =
    [
        new() { Id = "khoi-dong", Name = "Khởi động", Order = 0, Chart = "bars" },
        new() { Id = "giai-ma", Name = "Giải mã", Order = 1, Chart = "bars" },
        new() { Id = "but-pha", Name = "Bứt phá", Order = 2, Chart = "bars" },
        new() { Id = "ve-dich", Name = "Về đích", Order = 3, Chart = "bars" }
    ];

    private static readonly Dictionary<string, RoundConfig> Rules = new()
    {
        ["khoi-dong"] = new RoundConfig
        {
            AllowedKinds = [QuestionKind.TEXT],
            Scoring = new ScoringRule.Constant(10),
            Turns =
            [
                new TurnConfig { Id = "phase1", Mode = QuestionMode.oral, Delivery = DeliveryMode.sequential, QuestionCount = 6, TimeBudgetSeconds = 40 },
                new TurnConfig { Id = "phase2", Mode = QuestionMode.text, Delivery = DeliveryMode.batch, QuestionCount = 6, TimeLimitSeconds = 10 }
            ]
        },
        ["giai-ma"] = new RoundConfig
        {
            AllowedKinds = [QuestionKind.KEYWORD, QuestionKind.HINT],
            Scoring = new ScoringRule.KeywordDerived(100, 10, 20, 0),
            Turns =
            [
                new TurnConfig { Id = "phase1", Mode = QuestionMode.text, Delivery = DeliveryMode.batch, QuestionCount = 8, HintCount = 8, TimeLimitSeconds = 15 }
            ]
        },
        ["but-pha"] = new RoundConfig
        {
            AllowedKinds = [QuestionKind.TEXT],
            Scoring = new ScoringRule.Constant(10),
            Turns =
            [
                new TurnConfig { Id = "phase1", Mode = QuestionMode.text, Delivery = DeliveryMode.batch, QuestionCount = 4, TimeLimitSeconds = 30 }
            ]
        },
        ["ve-dich"] = new RoundConfig
        {
            AllowedKinds = [QuestionKind.TEXT],
            Scoring = new ScoringRule.OutcomeMultipliers(1, -0.5, new OutcomePowers(new OutcomeStar(1.5, -1))),
            Turns =
            [
                new TurnConfig
                {
                    Id = "phase1", Mode = QuestionMode.text, Delivery = DeliveryMode.pick, PickCount = 3,
                    SecondsByValue = new() { ["20"] = 15, ["30"] = 20, ["40"] = 30, ["50"] = 45 }
                },
                new TurnConfig
                {
                    Id = "phase2", Mode = QuestionMode.oral, Delivery = DeliveryMode.sequential,
                    BuzzWindowSeconds = 5, PickCount = 3,
                    SecondsByValue = new() { ["20"] = 15, ["30"] = 20, ["40"] = 30, ["50"] = 45 }
                }
            ]
        }
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
