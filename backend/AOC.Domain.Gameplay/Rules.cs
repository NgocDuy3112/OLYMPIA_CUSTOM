using System.Text.Json;
using AOC.Domain.Contracts;

namespace AOC.Domain.Gameplay;

public static class RoundRules
{
    public sealed record KhoiDongRules(
        string Version,
        int Phase1Questions, 
        int Phase1BudgetS, 
        int Phase2Questions, 
        int Phase2WindowS, 
        int PointsPerCorrect
    );

    public sealed record GiaiMaRules(
        string Version,
        int HintCount, 
        int HintWindowS, 
        int Start, 
        int DropPerHint, 
        int Floor
    );

    public sealed record SpeedBands(
        List<SpeedBand> Bands, 
        List<int> Multipliers, 
        int LateMultiplier
    );
    public sealed record ButPhaRules(
        string Version,
        int QuestionCount, int QuestionLimitS, List<SpeedBand> Bands, List<int> Multipliers, int LateMultiplier)
    {
        public SpeedBands AsSpeedBands() => new(Bands, Multipliers, LateMultiplier);
    }
    public sealed record VeDichRules(
        string Version,
        double CorrectPct,
        double IncorrectPct,
        VeDichStar Star,
        int BuzzWindowS,
        int PickCount,
        Dictionary<int, int> SecondsByValue,
        VeDichAssign Assign
    );

    public sealed record VeDichStar(double Correct, double Incorrect);

    public sealed record VeDichAssign(
        double BuzzerCorrect,
        double BuzzerIncorrect,
        double PartnerWhenBuzzerCorrect,
        double PartnerWhenBuzzerIncorrect,
        double NobodyBuzzed
    );

    private static TurnConfig? TurnOf(RoundConfig? config, Flow flow)
        => config?.Turns.FirstOrDefault(t => t.Flow == flow);

    private static T? ReadBatch<T>(RoundConfig? config) where T : class
    {
        if (config is null) return null;
        if (config.Rules is not { } raw) return null;
        if (raw.ValueKind is JsonValueKind.Undefined or JsonValueKind.Null) return null;
        return raw.Deserialize<T>(RuleBatches.Json);
    }

    private static TurnConfig? FirstTurn(RoundConfig? config)
        => config?.Turns.Count > 0 ? config.Turns[0] : null;

    private static int? ConstantPoints(RoundConfig? config)
        => config?.Scoring is ScoringRule.Constant c ? c.Points : null;

    public static KhoiDongRules ResolveKhoiDong(RoundConfig? config)
    {
        var seed = ReadBatch<KhoiDongRules>(config) ?? RuleBatches.KhoiDong;
        var rieng = TurnOf(config, Flow.rieng);
        var chung = TurnOf(config, Flow.chung);
        var resolved = seed;
        if (rieng?.QuestionCount is int questions)
            resolved = resolved with { Phase1Questions = questions };
        if (rieng?.TimeBudgetSeconds is int budget)
            resolved = resolved with { Phase1BudgetS = budget };
        if (chung?.TimeLimitSeconds is int window)
            resolved = resolved with { Phase2WindowS = window };
        if (config?.Scoring is ScoringRule.Constant constant)
            resolved = resolved with { PointsPerCorrect = constant.Points };
        return resolved;
    }

    public static GiaiMaRules ResolveGiaiMa(RoundConfig? config)
    {
        var seed = ReadBatch<GiaiMaRules>(config) ?? RuleBatches.GiaiMa;
        var turn = FirstTurn(config);
        var resolved = seed;
        if (turn?.HintCount is int hints)
            resolved = resolved with { HintCount = hints };
        if (turn?.TimeLimitSeconds is int window)
            resolved = resolved with { HintWindowS = window };
        if (config?.Scoring is ScoringRule.KeywordDerived keyword)
        {
            resolved = resolved with
            {
                Start = keyword.Initial,
                DropPerHint = keyword.DropPerHint
            };
            if (keyword.Floor is int floor)
                resolved = resolved with { Floor = floor };
        }
        return resolved;
    }

    public static ButPhaRules ResolveButPha(RoundConfig? config)
    {
        var seed = ReadBatch<ButPhaRules>(config) ?? RuleBatches.ButPha;
        var turn = FirstTurn(config);
        var resolved = seed;
        if (turn?.QuestionCount is int questions)
            resolved = resolved with { QuestionCount = questions };
        if (turn?.TimeLimitSeconds is int limit)
            resolved = resolved with { QuestionLimitS = limit };
        if (config?.Scoring is ScoringRule.RankMultiplier sprint)
        {
            if (sprint.Bands is List<SpeedBand> bands)
                resolved = resolved with { Bands = bands };
            if (sprint.Multipliers is List<int> multipliers)
            {
                var late = seed.LateMultiplier;
                if (multipliers.Count > 0) late = multipliers[^1];
                resolved = resolved with { Multipliers = multipliers, LateMultiplier = late };
            }
        }
        return resolved;
    }

    public static VeDichRules ResolveVeDich(RoundConfig? config)
    {
        var seed = ReadBatch<VeDichRules>(config) ?? RuleBatches.VeDich;
        if (seed.Assign is null)
            seed = seed with { Assign = RuleBatches.VeDich.Assign };
        var chung = TurnOf(config, Flow.chung);
        var rieng = TurnOf(config, Flow.rieng);
        var resolved = seed;
        if (config?.Scoring is ScoringRule.OutcomeMultipliers main)
        {
            resolved = resolved with
            {
                CorrectPct = main.Correct,
                IncorrectPct = main.Incorrect,
                Star = new VeDichStar(main.Powers.Star.Correct, main.Powers.Star.Incorrect)
            };
        }
        if (rieng?.BuzzWindowSeconds is int buzzWindow)
            resolved = resolved with { BuzzWindowS = buzzWindow };
        if (rieng?.PickCount is int pickCount)
            resolved = resolved with { PickCount = pickCount };
        if (chung?.SecondsByValue is Dictionary<int, int> chungSeconds)
            resolved = resolved with { SecondsByValue = chungSeconds };
        else if (rieng?.SecondsByValue is Dictionary<int, int> riengSeconds)
            resolved = resolved with { SecondsByValue = riengSeconds };
        return resolved;
    }

    public static int? VeDichClockSeconds(VeDichRules rules, int value)
    {
        if (rules.SecondsByValue.TryGetValue(value, out var seconds)) return seconds;
        if (RuleBatches.VeDich.SecondsByValue.TryGetValue(value, out var fallback)) return fallback;
        return null;
    }
}
