namespace AOC.Domain.Gameplay.Scoring;

public static class JsMath
{
    public static int Round(double x) => (int)Math.Floor(x + 0.5);
}

public static class KhoiDongScoring
{
    public static int Points(bool correct, int points) => correct ? points : 0;
}

public static class GiaiMaScoring
{
    public sealed record KeywordRules(int Start, int DropPerHint, int Floor);

    public static int KeywordValue(int correctHintsRevealed, KeywordRules rules)
        => Math.Max(rules.Floor, rules.Start - rules.DropPerHint * correctHintsRevealed);

    public static int KeywordAnswerPoints(int correctHintsRevealed, bool correct, KeywordRules rules)
        => correct ? KeywordValue(correctHintsRevealed, rules) : 0;
}

public static class ButPhaScoring
{
    public static int BasePointsForTime(double seconds, IReadOnlyList<Contracts.SpeedBand> bands)
    {
        foreach (var band in bands)
            if (seconds < band.UntilSec)
                return band.Points;
        return bands.Count > 0 ? bands[^1].Points : 0;
    }

    public static int SpeedMultiplier(int order, RoundRules.SpeedBands rules)
    {
        if (order < 1) throw new ArgumentOutOfRangeException(nameof(order), $"order must be >= 1, got {order}");
        return order - 1 < rules.Multipliers.Count ? rules.Multipliers[order - 1] : rules.LateMultiplier;
    }

    public static int Points(bool correct, double seconds, int order, RoundRules.SpeedBands rules)
    {
        if (!correct) return 0;
        return BasePointsForTime(seconds, rules.Bands) * SpeedMultiplier(order, rules);
    }
}

public static class VeDichScoring
{
    public static int Points(int faceValue, bool correct, RoundRules.VeDichRules scoring, bool star = false)
    {
        var pct = star
            ? (correct ? scoring.Star.Correct : scoring.Star.Incorrect)
            : (correct ? scoring.CorrectPct : scoring.IncorrectPct);
        return JsMath.Round(faceValue * pct);
    }

    public sealed record AssignPayout(int Buzzer, int Partner);

    public static AssignPayout Assign(
        int faceValue, bool? buzzerCorrect, RoundRules.VeDichAssign assign)
    {
        if (buzzerCorrect is null)
        {
            var both = JsMath.Round(faceValue * assign.NobodyBuzzed);
            return new AssignPayout(both, both);
        }
        var buzzer = buzzerCorrect.Value ? assign.BuzzerCorrect : assign.BuzzerIncorrect;
        var partner = buzzerCorrect.Value
            ? assign.PartnerWhenBuzzerCorrect
            : assign.PartnerWhenBuzzerIncorrect;
        return new AssignPayout(
            JsMath.Round(faceValue * buzzer),
            JsMath.Round(faceValue * partner)
        );
    }
}
