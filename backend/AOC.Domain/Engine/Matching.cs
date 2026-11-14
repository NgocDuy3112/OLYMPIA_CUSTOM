using System.Text.Json;
using AOC.Domain.Contracts;

namespace AOC.Domain.Engine;

/// <summary>Port of engine/matching.ts — text normalization and answer auto-matching.</summary>
public static partial class Matching
{
    /// <summary>Answer comparison: trim + ignore case. Accents are kept.</summary>
    public static string NormalizeText(string input)
        => input.Trim().ToLowerInvariant();

    private static List<string> UniqueSorted(IEnumerable<string> values)
        => values.Distinct().OrderBy(v => v, StringComparer.Ordinal).ToList();

    private static bool SameSet(IReadOnlyList<string> a, IReadOnlyList<string> b)
    {
        var left = UniqueSorted(a);
        var right = UniqueSorted(b);
        return left.Count == right.Count && left.SequenceEqual(right, StringComparer.Ordinal);
    }

    public static bool AutoMatch(QuestionKind kind, QuestionPayload payload, SubmittedAnswerValue value)
    {
        if (kind == QuestionKind.CHOICE)
        {
            if (value is not SubmittedAnswerValue.Picked picked) return false;
            if (payload is not QuestionPayload.Choice choice) return false;
            return picked.Items.Count > 0 && SameSet(picked.Items, choice.CorrectSet);
        }

        if (value is not SubmittedAnswerValue.Text text) return false;
        var submitted = text.Value;
        if (submitted.Length == 0) return false;

        if (kind == QuestionKind.TEXT || kind == QuestionKind.HINT)
        {
            if (payload is not QuestionPayload.Text textPayload) return false;
            var needle = NormalizeText(submitted);
            return textPayload.AcceptedAnswers.Any(answer => NormalizeText(answer) == needle);
        }

        if (payload is not QuestionPayload.Keyword keyword) return false;
        return NormalizeText(submitted) == NormalizeText(keyword.Code);
    }

    /// <summary>AutoMatch against a raw jsonb payload (for stored match questions).</summary>
    public static bool AutoMatch(QuestionKind kind, JsonElement payload, SubmittedAnswerValue value)
    {
        var typed = JsonSerializer.Deserialize<QuestionPayload>(payload.GetRawText())
            ?? throw new InvalidOperationException("payload failed to deserialize");
        return AutoMatch(kind, typed, value);
    }
}
