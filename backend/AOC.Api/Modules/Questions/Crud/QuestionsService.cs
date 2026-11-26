using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using AOC.Api.Http;
using AOC.Api.Shared;
using AOC.Domain.Contracts;
using AOC.Infrastructure.Data;
using AOC.Infrastructure.Data.Entities;

namespace AOC.Api.Modules.Questions;

public sealed class QuestionsService(AOCDbContext db)
{
    public const int MaxBatchSize = 500;
    private const int HintsPerSet = 8;
    private const int BatchInsertChunk = 100;

    public sealed record WriteContext(Guid ActorId, Guid? ImportBatchId = null);

    public sealed record BatchError(int Index, string Code, string Message, List<string> Details);

    public sealed record BatchReport(
        bool DryRun, int Total, int Created, List<Guid> Ids, List<BatchError> Errors);


    public async Task<QuestionBankEntity> RequireQuestionAsync(string id)
        => await db.QuestionBank.AsNoTracking().FirstOrDefaultAsync(q => q.Id == Guid.Parse(id))
           ?? throw new QuestionError(QuestionErrorCode.NOT_FOUND, $"question {id} not found");


    private static List<string>? NormalizeTags(List<string>? tags)
    {
        if (tags is null) return null;
        if (tags.Count == 0) return [];
        Buckets.RequireBucketTag(tags);
        return tags;
    }

    private static JsonElement ScopedPayload(JsonElement payload, List<string>? tags)
        => Buckets.StripBucketKey(payload);

    private QuestionBankEntity QuestionValues(WriteContext ctx, CreateQuestionDto input)
    {
        var tags = NormalizeTags(input.Tags) ?? [];
        return new QuestionBankEntity
        {
            Kind = input.Kind,
            QuestionText = input.QuestionText,
            KeywordId = input.KeywordId is null ? null : Guid.Parse(input.KeywordId),
            Payload = ScopedPayload(input.Payload, tags),
            Tags = tags.ToArray(),
            Media = input.Media is null ? null : JsonDefaults.Serialize(input.Media),
            Status = QuestionStatus.DRAFT,
            ImportBatchId = ctx.ImportBatchId,
            CreatedBy = ctx.ActorId
        };
    }

    private void AssertQuestionPayload(CreateQuestionDto input)
    {
        if (string.IsNullOrEmpty(input.QuestionText))
            throw new QuestionError(QuestionErrorCode.VALIDATION,
                "Question payload failed validation", ["/questionText: String must have at least 1 characters"]);
        if (input.Tags is { Count: > 8 })
            throw new QuestionError(QuestionErrorCode.VALIDATION,
                "Question payload failed validation", ["/tags: Array must have at most 8 items"]);
        if (input.KeywordId is not null && !Guid.TryParse(input.KeywordId, out _))
            throw new QuestionError(QuestionErrorCode.VALIDATION,
                "Question payload failed validation", ["/keywordId: Expected string with format 'uuid'"]);

        Buckets.AssertPayloadForKind(input.Kind, input.Payload);
        NormalizeTags(input.Tags);
    }

    private async Task AssertHintSetAsync(QuestionKind kind, string? keywordId, Guid? excludeHintId = null)
    {
        if (keywordId is null) return;
        if (kind != QuestionKind.TEXT)
            throw new QuestionError(QuestionErrorCode.VALIDATION,
                "keywordId applies to TEXT questions only");

        var keywordGuid = Guid.Parse(keywordId);
        var keyword = await db.QuestionBank.AsNoTracking()
            .FirstOrDefaultAsync(q => q.Id == keywordGuid);
        if (keyword is null || keyword.Kind != QuestionKind.KEYWORD)
            throw new QuestionError(QuestionErrorCode.VALIDATION,
                $"keyword {keywordId} is not a KEYWORD question");

        var inSet = db.QuestionBank.AsNoTracking()
            .Where(q => q.Kind == QuestionKind.TEXT && q.KeywordId == keywordGuid);
        if (excludeHintId is not null)
            inSet = inSet.Where(q => q.Id != excludeHintId.Value);
        var tally = await inSet.CountAsync();
        if (tally >= HintsPerSet)
            throw new QuestionError(QuestionErrorCode.VALIDATION,
                $"this set already holds {HintsPerSet}/{HintsPerSet} hints");
    }

    public async Task<QuestionBankEntity> CreateQuestionAsync(WriteContext ctx, CreateQuestionDto input)
    {
        AssertQuestionPayload(input);
        await AssertHintSetAsync(input.Kind, input.KeywordId);

        var row = QuestionValues(ctx, input);
        db.QuestionBank.Add(row);
        await db.SaveChangesAsync();
        return row;
    }

    public async Task<QuestionBankEntity> DuplicateQuestionAsync(WriteContext ctx, string id)
    {
        var source = await RequireQuestionAsync(id);
        if (source.KeywordId is not null)
            await AssertHintSetAsync(source.Kind, source.KeywordId?.ToString());

        var row = new QuestionBankEntity
        {
            Kind = source.Kind,
            QuestionText = source.QuestionText,
            KeywordId = source.KeywordId,
            Payload = source.Payload,
            Media = source.Media,
            Tags = source.Tags,
            Status = QuestionStatus.DRAFT,
            CreatedBy = ctx.ActorId
        };
        db.QuestionBank.Add(row);
        await db.SaveChangesAsync();
        return row;
    }

    public async Task<QuestionBankEntity> UpdateQuestionAsync(string id, JsonElement patchInput)
    {
        var existing = await RequireQuestionAsync(id);

        var patch = new Dictionary<string, object?>();
        QuestionKind? kindPatch = null;
        string? keywordIdPatch = null;
        var hasKeywordId = false;

        if (patchInput.TryGetProperty("kind", out var kindEl) && kindEl.ValueKind != JsonValueKind.Null)
        {
            var raw = kindEl.GetString()!;
            if (!Enum.TryParse<QuestionKind>(raw, out var parsed))
                throw QuestionPayloadInvalid("/kind: Expected union value");
            kindPatch = parsed;
        }
        if (patchInput.TryGetProperty("keywordId", out var kwEl))
        {
            hasKeywordId = true;
            if (kwEl.ValueKind == JsonValueKind.Null)
            {
                keywordIdPatch = null;
            }
            else if (kwEl.ValueKind == JsonValueKind.String && Guid.TryParse(kwEl.GetString(), out _))
            {
                keywordIdPatch = kwEl.GetString();
            }
            else
            {
                throw QuestionPayloadInvalid("/keywordId: Expected string with format 'uuid' or null");
            }
        }

        if (kindPatch is not null && kindPatch != existing.Kind)
        {
            throw new QuestionError(QuestionErrorCode.VALIDATION,
                $"kind cannot change from {existing.Kind} to {kindPatch}");
        }

        JsonElement? payloadPatch = null;
        if (patchInput.TryGetProperty("payload", out var payloadEl) && payloadEl.ValueKind != JsonValueKind.Null)
        {
            Buckets.AssertPayloadForKind(kindPatch ?? existing.Kind, payloadEl);
            payloadPatch = Buckets.StripBucketKey(payloadEl);
        }

        List<string>? tagsPatch = null;
        if (patchInput.TryGetProperty("tags", out var tagsEl) && tagsEl.ValueKind != JsonValueKind.Null)
        {
            tagsPatch = tagsEl.Deserialize<List<string>>(JsonApi.Options) ?? [];
            NormalizeTags(tagsPatch);
            if (Buckets.BucketOfTags(tagsPatch) is not null)
            {
                var current = payloadPatch ?? existing.Payload;
                if (current.ValueKind == JsonValueKind.Object && current.TryGetProperty("bucket", out _))
                {
                    var dict = current.Deserialize<Dictionary<string, JsonElement>>()!;
                    dict.Remove("bucket");
                    payloadPatch = JsonSerializer.SerializeToElement(dict, JsonApi.Options);
                }
            }
        }

        var nextKind = kindPatch ?? existing.Kind;
        var nextKeywordId = hasKeywordId ? keywordIdPatch : existing.KeywordId?.ToString();
        if (nextKeywordId is not null)
        {
            await AssertHintSetAsync(nextKind, nextKeywordId,
                existing.KeywordId is not null ? existing.Id : null);
        }

        var tracked = await db.QuestionBank.FirstAsync(q => q.Id == Guid.Parse(id));
        if (kindPatch is not null) tracked.Kind = kindPatch.Value;
        if (patchInput.TryGetProperty("questionText", out var qt) && qt.ValueKind == JsonValueKind.String)
            tracked.QuestionText = qt.GetString()!;
        if (hasKeywordId)
            tracked.KeywordId = keywordIdPatch is null ? null : Guid.Parse(keywordIdPatch);
        if (payloadPatch is not null) tracked.Payload = payloadPatch.Value;
        if (tagsPatch is not null) tracked.Tags = tagsPatch.ToArray();
        if (patchInput.TryGetProperty("media", out var mediaEl))
            tracked.Media = mediaEl.ValueKind == JsonValueKind.Null
                ? null
                : JsonDefaults.Serialize(mediaEl);
        tracked.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return tracked;
    }

    private static QuestionError QuestionPayloadInvalid(string detail)
        => new(QuestionErrorCode.VALIDATION, "Question payload failed validation", [detail]);

    public async Task<QuestionBankEntity> TransitionQuestionAsync(string id, QuestionStatus next, UserRole role)
    {
        var existing = await RequireQuestionAsync(id);
        if (existing.Status == next) return existing;

        Transitions.AssertTransition(existing.Status, next, role);

        var tracked = await db.QuestionBank.FirstAsync(q => q.Id == Guid.Parse(id));
        tracked.Status = next;
        tracked.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return tracked;
    }

    public sealed record CreateQuestionDto(
        QuestionKind Kind,
        string QuestionText,
        string? KeywordId,
        JsonElement Payload,
        Media? Media,
        List<string>? Tags);

    public static CreateQuestionDto ParseCreate(JsonElement input)
    {
        if (input.ValueKind != JsonValueKind.Object)
            throw QuestionPayloadInvalid("<root>: Expected object");

        var rawKind = Validate.RequiredString(input, "kind");
        if (!Enum.TryParse<QuestionKind>(rawKind, out var kind))
            throw QuestionPayloadInvalid("/kind: Expected union value");
        var questionText = Validate.RequiredString(input, "questionText", minLength: 1);
        var keywordId = Validate.OptionalUuid(input, "keywordId");

        if (!input.TryGetProperty("payload", out var payload) || payload.ValueKind == JsonValueKind.Undefined)
            throw QuestionPayloadInvalid("/payload: Required field missing");
        JsonElement payloadClone = payload.Clone();

        Media? media = null;
        if (input.TryGetProperty("media", out var mediaEl) && mediaEl.ValueKind != JsonValueKind.Null)
        {
            try
            {
                media = mediaEl.Deserialize<Media>(JsonApi.Options);
            }
            catch (JsonException)
            {
                throw QuestionPayloadInvalid("/media: Expected object or null");
            }
        }

        List<string>? tags = null;
        if (input.TryGetProperty("tags", out var tagsEl) && tagsEl.ValueKind != JsonValueKind.Null)
        {
            if (tagsEl.ValueKind != JsonValueKind.Array)
                throw QuestionPayloadInvalid("/tags: Expected array");
            tags = tagsEl.EnumerateArray().Select(t =>
            {
                var value = t.GetString() ?? "";
                if (value.Length is < 1 or > 64)
                    throw QuestionPayloadInvalid("/tags: String must have at most 64 characters");
                return value;
            }).ToList();
            if (tags.Count > 8)
                throw QuestionPayloadInvalid("/tags: Array must have at most 8 items");
        }

        return new CreateQuestionDto(kind, questionText, keywordId, payloadClone, media, tags);
    }

    public static string Fingerprint(string kind, string questionText, JsonElement payload, IReadOnlyList<string>? tags)
    {
        JsonElement? raw = payload.ValueKind == JsonValueKind.Object ? payload : null;

        string? bucket = Buckets.BucketOfTags(tags);
        if (bucket is null && raw is { } r
            && r.TryGetProperty("bucket", out var b) && b.ValueKind == JsonValueKind.String)
            bucket = b.GetString();

        JsonElement canonicalPayload = payload;
        if (raw is not null)
        {
            canonicalPayload = Buckets.StripBucketKey(payload);
        }

        var canonical = Canonicalize(canonicalPayload);
        return JsonSerializer.Serialize(new[]
        {
            kind,
            questionText,
            bucket ?? "",
            canonical.GetRawText()
        });
    }

    private static JsonElement Canonicalize(JsonElement value)
    {
        switch (value.ValueKind)
        {
            case JsonValueKind.Array:
            {
                var list = value.EnumerateArray().Select(Canonicalize).ToList();
                return JsonSerializer.SerializeToElement(list);
            }
            case JsonValueKind.Object:
            {
                var dict = value.EnumerateObject()
                    .ToDictionary(p => p.Name, p => Canonicalize(p.Value), StringComparer.Ordinal);
                var sorted = new SortedDictionary<string, JsonElement>(dict, StringComparer.Ordinal);
                return JsonSerializer.SerializeToElement(sorted);
            }
            default:
                return value.Clone();
        }
    }

    public sealed record BulkQuestionFailure(Guid Id, string Code, string Message);

    public sealed record BulkQuestionsReport(
        string Action, int Total, int Affected, List<Guid> Ids, List<BulkQuestionFailure> Errors);

    public async Task<BulkQuestionsReport> BulkQuestionsAsync(
        WriteContext ctx, string action, List<Guid> ids, QuestionStatus? status, string? bucket, UserRole role)
    {
        if (ids.Count == 0)
            throw new QuestionError(QuestionErrorCode.VALIDATION, "no questions selected");
        if (ids.Count > MaxBatchSize)
            throw new QuestionError(QuestionErrorCode.VALIDATION,
                $"a bulk action may target at most {MaxBatchSize} questions");
        if (ids.Distinct().Count() != ids.Count)
            throw new QuestionError(QuestionErrorCode.VALIDATION, "ids must be unique");

        if (action == "status" && status is null)
            throw new QuestionError(QuestionErrorCode.VALIDATION, "action status needs a status");
        if (action == "group" && (bucket is null || !Buckets.IsBucketTag(bucket)))
            throw new QuestionError(QuestionErrorCode.VALIDATION,
                $"action group needs a bucket — expected one of: {string.Join(", ", Buckets.AllBuckets)}");
        if (action is not ("status" or "duplicate" or "group"))
            throw new QuestionError(QuestionErrorCode.VALIDATION,
                $"unknown bulk action \"{action}\" — expected status, duplicate or group");

        var affected = new List<Guid>();
        var errors = new List<BulkQuestionFailure>();
        foreach (var id in ids)
        {
            try
            {
                if (action == "status")
                    await TransitionQuestionAsync(id.ToString(), status!.Value, role);
                else if (action == "duplicate")
                    await DuplicateQuestionAsync(ctx, id.ToString());
                else
                    await SetBucketAsync(id, bucket!);
                affected.Add(id);
            }
            catch (QuestionError error)
            {
                errors.Add(new BulkQuestionFailure(id, error.Code.ToString(), error.Message));
            }
        }

        return new BulkQuestionsReport(action, ids.Count, affected.Count, affected, errors);
    }

    private async Task SetBucketAsync(Guid id, string bucket)
    {
        var source = await RequireQuestionAsync(id.ToString());
        var tags = source.Tags.Where(tag => !Buckets.IsBucketTag(tag)).Append(bucket).ToList();
        var patch = JsonSerializer.SerializeToElement(new { tags }, JsonApi.Options);
        await UpdateQuestionAsync(id.ToString(), patch);
    }

    public async Task<BatchReport> ImportQuestionsAsync(
        WriteContext ctx, List<JsonElement> items, bool dryRun)
    {
        if (items.Count == 0)
            throw new QuestionError(QuestionErrorCode.VALIDATION, "no questions supplied");
        if (items.Count > MaxBatchSize)
            throw new QuestionError(QuestionErrorCode.VALIDATION,
                $"a batch may contain at most {MaxBatchSize} questions");

        var errors = new List<BatchError>();
        var shaped = new List<(int Index, CreateQuestionDto Input)>();

        for (var index = 0; index < items.Count; index++)
        {
            try
            {
                var dto = ParseCreate(items[index]);
                AssertQuestionPayload(dto);
                shaped.Add((index, dto));
            }
            catch (QuestionError error)
            {
                errors.Add(new BatchError(index, error.Code.ToString(), error.Message, error.Details.ToList()));
            }
        }

        var seenInBatch = new Dictionary<string, int>();
        var duplicatedInBatch = new HashSet<int>();
        foreach (var (index, input) in shaped)
        {
            var print = Fingerprint(input.Kind.ToString(), input.QuestionText, input.Payload, input.Tags);
            if (seenInBatch.TryGetValue(print, out var firstIndex))
            {
                errors.Add(new BatchError(index, "DUPLICATE",
                    $"identical to row {firstIndex} of this batch", []));
                duplicatedInBatch.Add(index);
            }
            else
            {
                seenInBatch[print] = index;
            }
        }

        var remaining = shaped.Where(t => !duplicatedInBatch.Contains(t.Index)).ToList();

        if (remaining.Count > 0)
        {
            var existing = await db.QuestionBank.AsNoTracking()
                .Select(q => new { q.Id, q.Kind, q.QuestionText, q.Payload, Tags = q.Tags })
                .ToListAsync();
            var existingByPrint = new Dictionary<string, Guid>();
            foreach (var row in existing)
            {
                var print = Fingerprint(row.Kind.ToString(), row.QuestionText, row.Payload, row.Tags);
                existingByPrint[print] = row.Id;
            }

            foreach (var (index, input) in remaining)
            {
                var print = Fingerprint(input.Kind.ToString(), input.QuestionText, input.Payload, input.Tags);
                if (existingByPrint.TryGetValue(print, out var existingId))
                    errors.Add(new BatchError(index, "DUPLICATE",
                        $"identical to existing question {existingId}", []));
            }
        }

        errors = errors.OrderBy(e => e.Index).ToList();
        if (errors.Count > 0 || dryRun)
            return new BatchReport(dryRun, items.Count, 0, [], errors);

        var ids = new List<Guid>();
        for (var start = 0; start < shaped.Count; start += BatchInsertChunk)
        {
            var chunk = shaped.Skip(start).Take(BatchInsertChunk).ToList();
            foreach (var (_, input) in chunk)
            {
                var row = QuestionValues(ctx, input);
                db.QuestionBank.Add(row);
                ids.Add(row.Id);
            }
            await db.SaveChangesAsync();
        }

        return new BatchReport(dryRun, items.Count, ids.Count, ids, []);
    }
}
