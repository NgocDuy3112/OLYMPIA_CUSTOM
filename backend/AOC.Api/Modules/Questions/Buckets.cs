using System.Text.Json;
using System.Text.RegularExpressions;
using AOC.Api.Http;
using AOC.Domain.Contracts;
using AOC.Domain.Gameplay;

namespace AOC.Api.Modules.Questions;

public static class Buckets
{
    public static readonly Dictionary<string, QuestionKind> BucketKind = new()
    {
        ["khoi-dong:rieng"] = QuestionKind.TEXT,
        ["khoi-dong:chung"] = QuestionKind.TEXT,
        ["giai-ma"] = QuestionKind.KEYWORD,
        ["but-pha"] = QuestionKind.TEXT,
        ["ve-dich:20"] = QuestionKind.TEXT,
        ["ve-dich:30"] = QuestionKind.TEXT,
        ["ve-dich:40"] = QuestionKind.TEXT,
        ["ve-dich:50"] = QuestionKind.TEXT,
        ["cau-hoi-phu"] = QuestionKind.TEXT
    };

    public static readonly List<string> AllBuckets = BucketKind.Keys.ToList();

    private static readonly HashSet<string> BucketKeys = AllBuckets.ToHashSet();

    public static bool IsBucketTag(string tag) => BucketKeys.Contains(tag);

    public static string? BucketOfTags(IEnumerable<string>? tags)
    {
        if (tags is null) return null;
        return tags.FirstOrDefault(IsBucketTag);
    }

    public static string RequireBucketTag(IEnumerable<string>? tags)
    {
        var found = (tags ?? []).Where(IsBucketTag).ToList();
        if (found.Count == 0)
            throw new QuestionError(QuestionErrorCode.VALIDATION,
                "a question carries exactly one bucket tag",
                [$"expected one of: {string.Join(", ", AllBuckets)}"]);
        if (found.Count > 1)
            throw new QuestionError(QuestionErrorCode.VALIDATION,
                "a question carries exactly one bucket tag",
                [$"found: {string.Join(", ", found)}"]);
        return found[0];
    }

    public sealed record Slot(string RoundId, string? TurnId = null, int? Points = null);

    private static readonly HashSet<string> MappedRounds = ["khoi-dong", "giai-ma", "but-pha", "ve-dich"];

    public static List<string> ExpandBucketParam(string value)
    {
        var matches = AllBuckets.Where(b => b == value || b.StartsWith($"{value}:")).ToList();
        if (matches.Count == 0)
            throw new QuestionError(QuestionErrorCode.VALIDATION, $"unknown bucket \"{value}\"",
                [$"expected a round ({string.Join(", ", AllBuckets.Select(b => b.Split(':')[0]).Distinct())}) or a full bucket"]);
        return matches;
    }

    private static IEnumerable<(string RoundId, TurnConfig Turn)> TurnsOf()
    {
        foreach (var round in AocRulebook.AocRounds)
        {
            var config = AocRulebook.AocRoundConfig(round.Id);
            if (config is null) continue;
            foreach (var turn in config.Turns) yield return (round.Id, turn);
        }
    }

    private static int? PointsOf(string bucket)
    {
        var colon = bucket.IndexOf(':');
        if (colon < 0) return null;
        var suffix = bucket[(colon + 1)..];
        return int.TryParse(suffix, out var points) ? points : null;
    }

    public static Slot SlotForBucket(string bucket)
    {
        if (bucket == QuestionsService.TieBreakBucket)
            throw new QuestionError(QuestionErrorCode.VALIDATION,
                "tiebreak questions are not assembled into rounds");

        foreach (var (roundId, turn) in TurnsOf())
            if (turn.Buckets is not null && turn.Buckets.Contains(bucket))
                return new Slot(roundId, turn.Id, PointsOf(bucket));

        throw new QuestionError(QuestionErrorCode.VALIDATION, $"no match slot for bucket \"{bucket}\"",
            [$"expected one of: {string.Join(", ", AllBuckets)}"]);
    }

    public static string ExpectedBucketForSlot(Slot slot)
    {
        var config = AocRulebook.AocRoundConfig(slot.RoundId)
            ?? throw new QuestionError(QuestionErrorCode.VALIDATION,
                $"round \"{slot.RoundId}\" has no bucket mapping");

        foreach (var turn in config.Turns)
        {
            if (turn.Id != slot.TurnId) continue;
            if (turn.Buckets is null)
                throw new QuestionError(QuestionErrorCode.VALIDATION,
                    $"turn \"{turn.Id}\" of round \"{slot.RoundId}\" declares no buckets");

            foreach (var bucket in turn.Buckets)
                if (PointsOf(bucket) == slot.Points && bucket != QuestionsService.TieBreakBucket)
                    return bucket;

            throw new QuestionError(QuestionErrorCode.VALIDATION,
                $"turn \"{turn.Id}\" of round \"{slot.RoundId}\" has no bucket for {slot.Points?.ToString() ?? "no points"}");
        }

        throw new QuestionError(QuestionErrorCode.VALIDATION,
            $"round \"{slot.RoundId}\" has no turn \"{slot.TurnId ?? "?"}\"");
    }

    public static List<QuestionKind> ExpectedKindsForBucket(string bucket, bool keywordLinked = false)
    {
        if (bucket == "giai-ma") return keywordLinked ? [QuestionKind.HINT] : [QuestionKind.KEYWORD];
        return [BucketKind[bucket]];
    }

    public sealed record SlotConflictSource(
        IReadOnlyList<string>? Tags = null,
        string? Kind = null,
        string? KeywordId = null);


    private static QuestionError Fail(string message, List<string>? details = null)
        => new(QuestionErrorCode.VALIDATION, message, details ?? []);

    private static void RequireAccepted(JsonElement p, string type)
    {
        if (!p.TryGetProperty("acceptedAnswers", out var accepted)
            || accepted.ValueKind != JsonValueKind.Array || accepted.GetArrayLength() == 0)
            throw Fail($"{type} questions require payload.acceptedAnswers (one entry is enough)");
        if (accepted.EnumerateArray().Any(a =>
                a.ValueKind != JsonValueKind.String || string.IsNullOrWhiteSpace(a.GetString())))
            throw Fail($"{type} questions require non-empty strings in payload.acceptedAnswers");
    }

    private static void RequireChoices(JsonElement p, int minOptions, bool exactlyOneCorrect)
    {
        if (!p.TryGetProperty("options", out var options) || options.ValueKind != JsonValueKind.Array
            || options.GetArrayLength() < minOptions)
            throw Fail($"payload.options needs at least {minOptions} entries" +
            (exactlyOneCorrect ? " — the audience picks exactly one" : ""));

        var ids = options.EnumerateArray()
            .Select(o => o.TryGetProperty("id", out var id) && id.ValueKind == JsonValueKind.String
                ? id.GetString()
                : null)
            .ToList();
        if (ids.Any(id => string.IsNullOrEmpty(id)))
            throw Fail("every payload option needs a non-empty string id");
        if (ids.Distinct().Count() != ids.Count)
            throw Fail("payload option ids must be unique");

        if (!p.TryGetProperty("correctSet", out var correctSet) || correctSet.ValueKind != JsonValueKind.Array
            || correctSet.GetArrayLength() == 0)
            throw Fail("payload.correctSet must name the correct option(s)");
        var correct = correctSet.EnumerateArray().Select(c => c.ToString()).ToList();
        if (exactlyOneCorrect && correct.Count != 1)
            throw Fail("payload.correctSet must name exactly one correct choice");
        var unknown = correct.Where(id => !ids.Contains(id)).ToList();
        if (unknown.Count > 0)
            throw Fail("payload.correctSet must reference existing option ids",
                unknown.Select(id => $"unknown option id \"{id}\"").ToList());
    }

    public static void AssertPayloadForKind(QuestionKind kind, JsonElement payload)
    {
        var p = payload.ValueKind == JsonValueKind.Object ? payload : default;
        if (p.ValueKind == JsonValueKind.Undefined)
            p = JsonSerializer.SerializeToElement(new { });

        switch (kind)
        {
            case QuestionKind.TEXT:
            case QuestionKind.HINT:
                RequireAccepted(p, kind.ToString());
                if (p.TryGetProperty("options", out var opts) && opts.ValueKind == JsonValueKind.Array
                    && opts.GetArrayLength() > 0)
                    RequireChoices(p, 2, exactlyOneCorrect: true);
                return;
            case QuestionKind.CHOICE:
                RequireChoices(p, 1, exactlyOneCorrect: false);
                return;
            case QuestionKind.KEYWORD:
                if (!p.TryGetProperty("code", out var code) || code.ValueKind != JsonValueKind.String
                    || string.IsNullOrWhiteSpace(code.GetString()))
                    throw Fail("KEYWORD questions require a non-empty payload.code");
                return;
        }
    }

    public static JsonElement StripBucketKey(JsonElement payload)
    {
        if (payload.ValueKind != JsonValueKind.Object) return payload;
        var dict = payload.Clone().Deserialize<Dictionary<string, JsonElement>>()!;
        dict.Remove("type");
        dict.Remove("bucket");
        return JsonSerializer.SerializeToElement(dict, JsonApi.Options);
    }

    public static string? SlotConflict(Slot slot, SlotConflictSource source)
    {
        if (!MappedRounds.Contains(slot.RoundId)) return null;

        string expected;
        try
        {
            expected = ExpectedBucketForSlot(slot);
        }
        catch (QuestionError error)
        {
            return error.Message;
        }

        string where;
        if (slot.RoundId == "ve-dich")
        {
            where = $"{slot.RoundId} cell {(slot.Points?.ToString() ?? "?")}";
        }
        else
        {
            where = $"{slot.RoundId}/{slot.TurnId ?? "?"}";
        }

        var bucket = BucketOfTags(source.Tags);
        if (bucket is null) return null;
        if (bucket != expected)
            return $"bucket {bucket} does not fit slot {where} (expected {expected})";

        var rawKind = source.Kind;
        if (rawKind is null) return null;

        var kinds = ExpectedKindsForBucket(bucket, keywordLinked: !string.IsNullOrEmpty(source.KeywordId));
        if (!Enum.TryParse<QuestionKind>(rawKind, out var parsedKind))
            return $"unknown question kind \"{rawKind}\"";
        if (!kinds.Contains(parsedKind))
            return $"kind {rawKind} does not fit slot {where} (expected {string.Join(" or ", kinds)})";
        return null;
    }

    public static List<(string Id, string Text)>? AudienceFace(JsonElement payload)
    {
        if (payload.ValueKind != JsonValueKind.Object
            || !payload.TryGetProperty("options", out var options)
            || options.ValueKind != JsonValueKind.Array || options.GetArrayLength() == 0)
            return null;

        var face = new List<(string, string)>();
        foreach (var option in options.EnumerateArray())
        {
            if (!option.TryGetProperty("id", out var id) || id.ValueKind != JsonValueKind.String
                || !option.TryGetProperty("text", out var text) || text.ValueKind != JsonValueKind.String)
                return null;
            face.Add((id.GetString()!, text.GetString()!));
        }
        return face;
    }
}
