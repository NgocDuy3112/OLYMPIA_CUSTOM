using System.Text.Json;
using System.Text.RegularExpressions;
using Olympia.Api.Http;

namespace Olympia.Api.Modules.Questions;

public enum QuestionType
{
    TEXT,
    ORAL,
    CHOICE,
    KEYWORD
}

/// <summary>Port of questions/buckets.ts — bucket tags, slots and payload guards.</summary>
public static class Buckets
{
    public static readonly Dictionary<string, QuestionType> BucketType = new()
    {
        ["khoi-dong:rieng"] = QuestionType.ORAL,
        ["khoi-dong:chung"] = QuestionType.TEXT,
        ["giai-ma"] = QuestionType.KEYWORD,
        ["but-pha"] = QuestionType.TEXT,
        ["ve-dich:20"] = QuestionType.TEXT,
        ["ve-dich:30"] = QuestionType.TEXT,
        ["ve-dich:40"] = QuestionType.ORAL,
        ["ve-dich:50"] = QuestionType.ORAL
    };

    public static readonly List<string> AllBuckets = BucketType.Keys.ToList();

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

    public static Slot SlotForBucket(string bucket) => bucket switch
    {
        "khoi-dong:rieng" => new Slot("khoi-dong", "phase1"),
        "khoi-dong:chung" => new Slot("khoi-dong", "phase2"),
        "giai-ma" => new Slot("giai-ma", "phase1"),
        "but-pha" => new Slot("but-pha", "phase1"),
        "ve-dich:20" => new Slot("ve-dich", "phase1", 20),
        "ve-dich:30" => new Slot("ve-dich", "phase1", 30),
        "ve-dich:40" => new Slot("ve-dich", "phase2", 40),
        "ve-dich:50" => new Slot("ve-dich", "phase2", 50),
        _ => throw new QuestionError(QuestionErrorCode.VALIDATION, $"no match slot for bucket \"{bucket}\"",
            [$"expected one of: {string.Join(", ", AllBuckets)}"])
    };

    public static string ExpectedBucketForSlot(Slot slot) => slot.RoundId switch
    {
        "khoi-dong" when slot.TurnId == "phase1" => "khoi-dong:rieng",
        "khoi-dong" when slot.TurnId == "phase2" => "khoi-dong:chung",
        "khoi-dong" => throw new QuestionError(QuestionErrorCode.VALIDATION,
            $"no bucket mapping for khoi-dong turn \"{slot.TurnId ?? "?"}\""),
        "giai-ma" => "giai-ma",
        "but-pha" => "but-pha",
        "ve-dich" when slot.Points is 20 or 30 or 40 or 50 => $"ve-dich:{slot.Points}",
        "ve-dich" => throw new QuestionError(QuestionErrorCode.VALIDATION,
            "a ve-dich entry needs its cell points (20, 30, 40 or 50)"),
        _ => throw new QuestionError(QuestionErrorCode.VALIDATION,
            $"round \"{slot.RoundId}\" has no bucket mapping")
    };

    public static List<QuestionType> ExpectedTypesForSlot(string bucket, bool keywordLinked = false)
        => bucket == "giai-ma"
            ? keywordLinked ? [QuestionType.TEXT] : [QuestionType.KEYWORD]
            : [BucketType[bucket]];

    // ---- payload guards --------------------------------------------------------

    private static QuestionError Fail(string message, List<string>? details = null)
        => new(QuestionErrorCode.VALIDATION, message, details ?? []);

    private static void RequireAccepted(JsonElement p, QuestionType type)
    {
        if (!p.TryGetProperty("acceptedAnswers", out var accepted)
            || accepted.ValueKind != JsonValueKind.Array || accepted.GetArrayLength() == 0)
            throw Fail($"{type} questions require payload.acceptedAnswers (one entry is enough)");
        if (accepted.EnumerateArray().Any(a =>
                a.ValueKind != JsonValueKind.String || string.IsNullOrWhiteSpace(a.GetString())))
            throw Fail($"{type} questions require non-empty strings in payload.acceptedAnswers");
        if (!p.TryGetProperty("normalize", out var normalize) || normalize.ValueKind != JsonValueKind.Object)
            throw Fail($"{type} questions require payload.normalize");
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

    public static void AssertPayloadForType(QuestionType type, JsonElement payload)
    {
        var p = payload.ValueKind == JsonValueKind.Object ? payload : default;
        if (p.ValueKind == JsonValueKind.Undefined)
            p = JsonSerializer.SerializeToElement(new { });

        if (p.TryGetProperty("type", out var declared) && declared.ValueKind == JsonValueKind.String
            && declared.GetString() != type.ToString())
            throw Fail($"payload.type \"{declared.GetString()}\" does not match the question type \"{type}\"");

        switch (type)
        {
            case QuestionType.TEXT:
                RequireAccepted(p, type);
                return;
            case QuestionType.ORAL:
                RequireAccepted(p, type);
                if (p.TryGetProperty("options", out var opts) && opts.ValueKind == JsonValueKind.Array
                    && opts.GetArrayLength() > 0)
                    RequireChoices(p, 2, exactlyOneCorrect: true);
                return;
            case QuestionType.CHOICE:
                RequireChoices(p, 1, exactlyOneCorrect: false);
                return;
            case QuestionType.KEYWORD:
                if (!p.TryGetProperty("code", out var code) || code.ValueKind != JsonValueKind.String
                    || string.IsNullOrWhiteSpace(code.GetString()))
                    throw Fail("KEYWORD questions require a non-empty payload.code");
                if (!p.TryGetProperty("normalize", out var norm) || norm.ValueKind != JsonValueKind.Object)
                    throw Fail("KEYWORD questions require payload.normalize");
                return;
        }
    }

    public static JsonElement PayloadWithType(QuestionType type, JsonElement payload)
    {
        if (payload.ValueKind != JsonValueKind.Object) return payload;
        var clone = payload.Clone();
        var dict = clone.Deserialize<Dictionary<string, JsonElement>>()!;
        dict["type"] = JsonSerializer.SerializeToElement(type.ToString());
        return JsonSerializer.SerializeToElement(dict, JsonApi.Options);
    }

    // ---- slot conflict ----------------------------------------------------------

    public sealed record SlotConflictSource(
        IReadOnlyList<string>? Tags = null,
        string? Type = null,
        string? KeywordId = null);

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

        var rawType = source.Type;
        if (rawType is null) return null;

        var types = ExpectedTypesForSlot(bucket, keywordLinked: !string.IsNullOrEmpty(source.KeywordId));
        if (!Enum.TryParse<QuestionType>(rawType, out var parsed))
            return $"unknown question type \"{rawType}\"";
        if (!types.Contains(parsed))
            return $"type {rawType} does not fit slot {where} (expected {string.Join(" or ", types)})";
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
