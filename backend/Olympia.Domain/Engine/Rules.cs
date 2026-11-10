using Olympia.Domain.Contracts;

namespace Olympia.Domain.Engine;

/// <summary>Port of engine/rules.ts — resolved per-round rule accessors with defaults.</summary>
public static class RoundRules
{
    public sealed record KhoiDongRules(int Phase1Questions, int Phase1BudgetS, int Phase2Questions, int Phase2WindowS, int PointsPerCorrect);
    public sealed record GiaiMaRules(int HintCount, int HintWindowS, int Start, int DropPerHint, int Floor);
    public sealed record SpeedBands(List<SpeedBand> Bands, List<int> Multipliers, int LateMultiplier);
    public sealed record ButPhaRules(int QuestionCount, int QuestionLimitS, List<SpeedBand> Bands, List<int> Multipliers, int LateMultiplier)
    {
        public SpeedBands AsSpeedBands() => new(Bands, Multipliers, LateMultiplier);
    }
    public sealed record VeDichRules(
        double CorrectPct,
        double IncorrectPct,
        VeDichStar Star,
        int BuzzWindowS,
        int PickCount,
        Dictionary<string, int> SecondsByValue
    );

    public sealed record VeDichStar(double Correct, double Incorrect);

    public static class Defaults
    {
        public static class KhoiDong
        {
            public const int Phase1Questions = 6;
            public const int Phase1BudgetS = 40;
            public const int Phase2Questions = 6;
            public const int Phase2WindowS = 10;
            public const int PointsPerCorrect = 10;
        }

        public static class GiaiMa
        {
            public const int HintCount = 8;
            public const int HintWindowS = 15;
            public const int Start = 100;
            public const int DropPerHint = 10;
            public const int Floor = 20;
        }

        public static class ButPha
        {
            public const int QuestionCount = 4;
            public const int QuestionLimitS = 30;
            public static readonly List<SpeedBand> Bands =
            [
                new(5, 15),
                new(15, 10),
                new(30, 5)
            ];
            public static readonly List<int> Multipliers = [4, 3, 2];
            public const int LateMultiplier = 1;
        }

        public static class VeDich
        {
            public const double CorrectPct = 1;
            public const double IncorrectPct = -0.5;
            public static readonly VeDichStar Star = new(1.5, -1);
            public const int BuzzWindowS = 5;
            public const int PickCount = 3;
            public static readonly Dictionary<string, int> SecondsByValue = new()
            {
                ["20"] = 15,
                ["30"] = 20,
                ["40"] = 30,
                ["50"] = 45
            };
        }
    }

    private static TurnConfig? TurnOf(RoundConfig? config, string id)
        => config?.Turns.FirstOrDefault(t => t.Id == id);

    public static KhoiDongRules DefaultKhoiDong() =>
        new(Defaults.KhoiDong.Phase1Questions, Defaults.KhoiDong.Phase1BudgetS,
            Defaults.KhoiDong.Phase2Questions, Defaults.KhoiDong.Phase2WindowS,
            Defaults.KhoiDong.PointsPerCorrect);

    public static GiaiMaRules DefaultGiaiMa() =>
        new(Defaults.GiaiMa.HintCount, Defaults.GiaiMa.HintWindowS,
            Defaults.GiaiMa.Start, Defaults.GiaiMa.DropPerHint, Defaults.GiaiMa.Floor);

    public static ButPhaRules DefaultButPha() =>
        new(Defaults.ButPha.QuestionCount, Defaults.ButPha.QuestionLimitS,
            Defaults.ButPha.Bands, Defaults.ButPha.Multipliers, Defaults.ButPha.LateMultiplier);

    public static VeDichRules DefaultVeDich() =>
        new(Defaults.VeDich.CorrectPct, Defaults.VeDich.IncorrectPct, Defaults.VeDich.Star,
            Defaults.VeDich.BuzzWindowS, Defaults.VeDich.PickCount, Defaults.VeDich.SecondsByValue);

    private static TurnConfig? FirstTurn(RoundConfig? config)
        => config?.Turns.Count > 0 ? config.Turns[0] : null;

    private static int? ConstantPoints(RoundConfig? config)
        => config?.Scoring is ScoringRule.Constant c ? c.Points : null;

    public static KhoiDongRules ResolveKhoiDong(RoundConfig? config)
    {
        var phase1 = TurnOf(config, "phase1");
        var phase2 = TurnOf(config, "phase2");
        return new KhoiDongRules(
            phase1?.QuestionCount ?? Defaults.KhoiDong.Phase1Questions,
            phase1?.TimeBudgetSeconds ?? Defaults.KhoiDong.Phase1BudgetS,
            Defaults.KhoiDong.Phase2Questions,
            phase2?.TimeLimitSeconds ?? Defaults.KhoiDong.Phase2WindowS,
            ConstantPoints(config) ?? Defaults.KhoiDong.PointsPerCorrect);
    }

    public static GiaiMaRules ResolveGiaiMa(RoundConfig? config)
    {
        var turn = FirstTurn(config);
        var keyword = config?.Scoring is ScoringRule.KeywordDerived k ? k : null;
        return new GiaiMaRules(
            turn?.HintCount ?? Defaults.GiaiMa.HintCount,
            turn?.TimeLimitSeconds ?? Defaults.GiaiMa.HintWindowS,
            keyword?.Initial ?? Defaults.GiaiMa.Start,
            keyword?.DropPerHint ?? Defaults.GiaiMa.DropPerHint,
            keyword?.Floor ?? Defaults.GiaiMa.Floor);
    }

    public static ButPhaRules ResolveButPha(RoundConfig? config)
    {
        var turn = FirstTurn(config);
        var sprint = config?.Scoring is ScoringRule.RankMultiplier r ? r : null;
        var multipliers = sprint?.Multipliers ?? Defaults.ButPha.Multipliers;
        var lateMultiplier = sprint?.Multipliers is { Count: > 0 } own
            ? own[^1]
            : Defaults.ButPha.LateMultiplier;
        return new ButPhaRules(
            turn?.QuestionCount ?? Defaults.ButPha.QuestionCount,
            turn?.TimeLimitSeconds ?? Defaults.ButPha.QuestionLimitS,
            sprint?.Bands ?? Defaults.ButPha.Bands,
            multipliers,
            lateMultiplier);
    }

    /// <summary>Answer window for a cell face value, or null when no clock is configured.</summary>
    public static int? VeDichClockSeconds(VeDichRules rules, int value)
    {
        var key = value.ToString();
        if (rules.SecondsByValue.TryGetValue(key, out var seconds)) return seconds;
        if (Defaults.VeDich.SecondsByValue.TryGetValue(key, out var fallback)) return fallback;
        return null;
    }

    public static VeDichRules ResolveVeDich(RoundConfig? config)
    {
        var phase1 = TurnOf(config, "phase1");
        var phase2 = TurnOf(config, "phase2");
        var main = config?.Scoring is ScoringRule.OutcomeMultipliers o ? o : null;
        var secondsByValue = phase1?.SecondsByValue
            ?? phase2?.SecondsByValue
            ?? Defaults.VeDich.SecondsByValue;
        return new VeDichRules(
            main?.Correct ?? Defaults.VeDich.CorrectPct,
            main?.Incorrect ?? Defaults.VeDich.IncorrectPct,
            main is not null
                ? new VeDichStar(main.Powers.Star.Correct, main.Powers.Star.Incorrect)
                : Defaults.VeDich.Star,
            phase2?.BuzzWindowSeconds ?? Defaults.VeDich.BuzzWindowS,
            phase2?.PickCount ?? Defaults.VeDich.PickCount,
            secondsByValue);
    }
}
