using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Olympia.Domain.Contracts;

namespace Olympia.Domain.Engine;

/// <summary>Port of engine/matching.ts — text normalization and answer auto-matching.</summary>
public static partial class Matching
{
    public static string NormalizeText(string input, Normalize rules)
    {
        var s = input;
        if (rules.Trim) s = s.Trim();
        if (!rules.CaseSensitive) s = s.ToLowerInvariant();
        if (rules.StripAccents)
        {
            s = s.Replace('đ', 'd').Replace('Đ', 'D');
            s = RemoveDiacritics(s);
        }
        return s;
    }

    private static string RemoveDiacritics(string s)
    {
        var decomposed = s.Normalize(NormalizationForm.FormD);
        var sb = new StringBuilder(decomposed.Length);
        foreach (var c in decomposed)
        {
            var category = CharUnicodeInfo.GetUnicodeCategory(c);
            if (category != UnicodeCategory.NonSpacingMark)
                sb.Append(c);
        }
        return sb.ToString().Normalize(NormalizationForm.FormC);
    }

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
            var needle = NormalizeText(submitted, textPayload.Normalize);
            return textPayload.AcceptedAnswers.Any(answer =>
                NormalizeText(answer, textPayload.Normalize) == needle);
        }

        if (payload is not QuestionPayload.Keyword keyword) return false;
        return NormalizeText(submitted, keyword.Normalize) == NormalizeText(keyword.Code, keyword.Normalize);
    }

    /// <summary>AutoMatch against a raw jsonb payload (for stored match questions).</summary>
    public static bool AutoMatch(QuestionKind kind, JsonElement payload, SubmittedAnswerValue value)
    {
        var typed = JsonSerializer.Deserialize<QuestionPayload>(payload.GetRawText())
            ?? throw new InvalidOperationException("payload failed to deserialize");
        return AutoMatch(kind, typed, value);
    }
}
