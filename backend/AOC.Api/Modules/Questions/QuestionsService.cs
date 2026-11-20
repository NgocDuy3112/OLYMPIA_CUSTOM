using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using AOC.Api.Http;
using AOC.Api.Modules.Questions.Reads;
using AOC.Api.Shared;
using AOC.Domain.Contracts;
using AOC.Infrastructure.Configuration;
using AOC.Infrastructure.Data;
using AOC.Infrastructure.Data.Entities;

namespace AOC.Api.Modules.Questions;

public static class Transitions
{
    private static readonly Dictionary<QuestionStatus, QuestionStatus[]> Edges = new()
    {
        [QuestionStatus.DRAFT] = [QuestionStatus.PUBLISHED, QuestionStatus.ARCHIVED],
        [QuestionStatus.PUBLISHED] = [QuestionStatus.DRAFT, QuestionStatus.ARCHIVED],
        [QuestionStatus.ARCHIVED] = []
    };

    private static readonly HashSet<string> AdminOnly = ["DRAFT→PUBLISHED"];

    public static void AssertTransition(QuestionStatus from, QuestionStatus to, UserRole role)
    {
        if (!Edges[from].Contains(to))
            throw new QuestionError(QuestionErrorCode.INVALID_TRANSITION,
                $"cannot move a question from {from} to {to}",
                [$"allowed from {from}: {(Edges[from].Length > 0 ? string.Join(", ", Edges[from]) : "none")}"]);

        if (AdminOnly.Contains($"{from}→{to}") && role != UserRole.ADMIN)
            throw new QuestionError(QuestionErrorCode.FORBIDDEN,
                $"only an admin may move a question from {from} to {to}");
    }
}

public static class PayloadGuards
{
    public static void AssertPayloadForKind(QuestionKind kind, JsonElement payload)
    {
        var p = payload.ValueKind == JsonValueKind.Object
            ? payload
            : JsonSerializer.SerializeToElement(new { });

        switch (kind)
        {
            case QuestionKind.CHOICE:
            {
                if (!p.TryGetProperty("options", out var options) || options.ValueKind != JsonValueKind.Array
                    || !p.TryGetProperty("correctSet", out var correctSet) || correctSet.ValueKind != JsonValueKind.Array)
                    throw Fail("console questions require payload.options and payload.correctSet");

                var optionList = options.EnumerateArray().ToList();
                if (optionList.Count == 0)
                    throw Fail("console questions require at least one option");
                var correctList = correctSet.EnumerateArray().ToList();
                if (correctList.Count == 0)
                    throw Fail("console questions require a non-empty correctSet");

                var ids = optionList
                    .Select(o => o.TryGetProperty("id", out var id) ? id.GetString() ?? "" : "")
                    .ToList();
                if (ids.Distinct().Count() != ids.Count)
                    throw Fail("console option ids must be unique");

                var unknown = correctList
                    .Select(c => c.ToString())
                    .Where(id => !ids.Contains(id))
                    .ToList();
                if (unknown.Count > 0)
                    throw Fail("correctSet must reference existing option ids",
                        unknown.Select(id => $"unknown option id \"{id}\"").ToList());
                return;
            }
            case QuestionKind.TEXT:
            case QuestionKind.HINT:
            {
                if (!p.TryGetProperty("acceptedAnswers", out var accepted) || accepted.ValueKind != JsonValueKind.Array)
                    throw Fail("TEXT questions require payload.acceptedAnswers");
                if (accepted.GetArrayLength() == 0)
                    throw Fail("TEXT questions require at least one accepted answer");
                return;
            }
            default:
            {
                if (!p.TryGetProperty("code", out var code) || code.ValueKind != JsonValueKind.String
                    || code.GetString()!.Length == 0)
                    throw Fail("KEYWORD questions require a non-empty payload.code");
                return;
            }
        }
    }

    private static QuestionError Fail(string message, List<string>? details = null)
        => new(QuestionErrorCode.VALIDATION, message, details ?? []);
}

public sealed class QuestionsService(AOCDbContext db) : IQuestionReads
{
    public const int MaxBatchSize = 500;
    private const int MaxPageSize = 500;
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
        if (kind != QuestionKind.HINT)
        {
            if (keywordId is not null)
                throw new QuestionError(QuestionErrorCode.VALIDATION,
                    "keywordId applies to HINT questions only");
            return;
        }
        if (keywordId is null)
            throw new QuestionError(QuestionErrorCode.VALIDATION,
                "a HINT belongs to a keyword set (keywordId is required)");

        var keywordGuid = Guid.Parse(keywordId);
        var keyword = await db.QuestionBank.AsNoTracking()
            .FirstOrDefaultAsync(q => q.Id == keywordGuid);
        if (keyword is null || keyword.Kind != QuestionKind.KEYWORD)
            throw new QuestionError(QuestionErrorCode.VALIDATION,
                $"keyword {keywordId} is not a KEYWORD question");

        var inSet = db.QuestionBank.AsNoTracking()
            .Where(q => q.Kind == QuestionKind.HINT && q.KeywordId == keywordGuid);
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
        if (source.Kind == QuestionKind.HINT)
            await AssertHintSetAsync(QuestionKind.HINT, source.KeywordId?.ToString());

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

        if (existing.Status == QuestionStatus.ARCHIVED)
            throw new QuestionError(QuestionErrorCode.IMMUTABLE,
                $"question {id} is archived and cannot be edited");

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
            var convertible =
                (existing.Kind == QuestionKind.TEXT && kindPatch == QuestionKind.HINT) ||
                (existing.Kind == QuestionKind.HINT && kindPatch == QuestionKind.TEXT);
            if (!convertible)
                throw new QuestionError(QuestionErrorCode.VALIDATION,
                    $"kind cannot change from {existing.Kind} to {kindPatch}",
                    ["only TEXT ↔ HINT conversion is allowed"]);
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
        if (nextKind == QuestionKind.HINT)
        {
            var keywordId = hasKeywordId ? keywordIdPatch : existing.KeywordId?.ToString();
            await AssertHintSetAsync(QuestionKind.HINT, keywordId,
                existing.Kind == QuestionKind.HINT ? existing.Id : null);
        }
        else if (hasKeywordId || existing.Kind == QuestionKind.HINT)
        {
            await AssertHintSetAsync(nextKind, keywordIdPatch);
            if (existing.Kind == QuestionKind.HINT && !hasKeywordId)
                keywordIdPatch = null;
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


    private static string? QuestionSearchQuery(string term)
    {
        var tokens = Regex.Split(term, @"\s+")
            .Select(t => Regex.Replace(t, @"[^\p{L}\p{N}]+", ""))
            .Where(t => t.Length > 0)
            .ToList();
        if (tokens.Count == 0) return null;
        return string.Join(" & ", tokens.Select((t, i) => i == tokens.Count - 1 ? $"{t}:*" : t));
    }

    private static string BucketConditionSql(string bucket)
    {
        var clauses = new List<string>
        {
            "tags && string_to_array({0}, ',')",
            "payload ->> 'bucket' = ANY(string_to_array({0}, ','))"
        };
        if (Buckets.ExpandBucketParam(bucket).Contains("giai-ma"))
            clauses.Add("kind IN ('KEYWORD', 'HINT')");
        clauses.Add("(cardinality(tags) = 0 AND payload ->> 'bucket' IS NULL AND kind NOT IN ('KEYWORD', 'HINT'))");
        return string.Join(" OR ", clauses.Select(c => $"({c})"));
    }

    private sealed class SqlWhere
    {
        private readonly List<string> clauses = [];
        private readonly List<object> args = [];

        public void Add(string template, params object[] values)
        {
            var start = args.Count;
            var placed = template;
            for (var i = values.Length - 1; i >= 0; i--)
                placed = placed.Replace("{" + i + "}", "{" + (start + i) + "}");

            clauses.Add(placed);
            args.AddRange(values);
        }

        public string Text()
        {
            if (clauses.Count == 0) return "";
            return " WHERE " + string.Join(" AND ", clauses);
        }

        public object[] Args() => [.. args];
    }

    private const string SelectRows = "SELECT * FROM question_bank";
    private const string OrderRows = "ORDER BY created_at DESC, id DESC";

    private async Task<List<QuestionBankEntity>> QueryRowsAsync(SqlWhere where, Page page)
    {
        var args = where.Args();
        var limitIndex = args.Length;
        var offsetIndex = args.Length + 1;

        var sql = SelectRows + where.Text() + " " + OrderRows
            + " LIMIT {" + limitIndex + "} OFFSET {" + offsetIndex + "}";

        var all = new object[args.Length + 2];
        args.CopyTo(all, 0);
        all[limitIndex] = page.Limit;
        all[offsetIndex] = page.Offset;

        return await db.Database.SqlQueryRaw<QuestionBankEntity>(sql, all).ToListAsync();
    }

    private Task<int> CountRowsAsync(SqlWhere where)
        => db.Database
            .SqlQueryRaw<int>("SELECT count(*) AS \"Value\" FROM question_bank" + where.Text(), where.Args())
            .SingleAsync();

    private static SqlWhere BuildFilter(QuestionFilter filters)
    {
        var where = new SqlWhere();

        if (filters.Status is { } status)
            where.Add("status = {0}::question_status", status.ToString());

        if (filters.Kind is { } kind)
            where.Add("kind = {0}::question_kind", kind.ToString());

        if (filters.KeywordId is { } keywordId)
            where.Add("keyword_id = {0}", keywordId);

        var ids = filters.Ids;
        if (ids is { Count: > 0 })
            where.Add("id = ANY({0})", ids.ToArray());

        var searchTs = filters.Search is { } term ? QuestionSearchQuery(term) : null;
        if (searchTs is not null)
            where.Add("search_vector @@ to_tsquery('simple', immutable_unaccent({0}))", searchTs);

        if (filters.Bucket is not null)
            where.Add($"({BucketConditionSql(filters.Bucket)})", string.Join(",", Buckets.ExpandBucketParam(filters.Bucket)));

        return where;
    }

    public async Task<PageResult<QuestionRow>> ListAsync(QuestionFilter filters, Page page)
    {
        var where = BuildFilter(filters);
        var total = await CountRowsAsync(where);
        var rows = await QueryRowsAsync(where, page);
        return Pagination.Result(rows.Select(QuestionRow.Of).ToList(), total, page);
    }

    public async Task<QuestionRow> RequireAsync(string id)
        => QuestionRow.Of(await RequireQuestionAsync(id));

    public async Task<PageResult<QuestionBankEntity>> ListForAssemblyAsync(
        List<QuestionKind>? kinds, string? bucket, string? search, Page page)
    {
        var where = new SqlWhere();
        where.Add("status = 'PUBLISHED'");

        if (kinds is { Count: > 0 })
            where.Add("kind = ANY({0})", kinds.ToArray());

        if (bucket is not null)
            where.Add($"({BucketConditionSql(bucket)})", string.Join(",", Buckets.ExpandBucketParam(bucket)));

        var searchTs = search is { } s ? QuestionSearchQuery(s) : null;
        if (searchTs is not null)
            where.Add("search_vector @@ to_tsquery('simple', immutable_unaccent({0}))", searchTs);

        var total = await CountRowsAsync(where);
        var rows = await QueryRowsAsync(where, page);
        return Pagination.Result(rows, total, page);
    }

    public async Task<PageResult<QuestionBankEntity>> ListForAgentAsync(
        QuestionKind? kind, string? search, Page page)
    {
        var where = new SqlWhere();
        where.Add("status IN ('PUBLISHED', 'ARCHIVED')");

        if (kind is { } k)
            where.Add("kind = {0}::question_kind", k.ToString());

        var searchTs = search is { } s ? QuestionSearchQuery(s) : null;
        if (searchTs is not null)
            where.Add("search_vector @@ to_tsquery('simple', immutable_unaccent({0}))", searchTs);

        var total = await CountRowsAsync(where);
        var rows = await QueryRowsAsync(where, page);
        return Pagination.Result(rows, total, page);
    }

    public async Task<QuestionBankEntity> GetForAgentAsync(string questionId)
    {
        var where = new SqlWhere();
        where.Add("id = {0}", Guid.Parse(questionId));
        where.Add("status IN ('PUBLISHED', 'ARCHIVED')");
        var rows = await QueryRowsAsync(where, new Page(1, 0));
        return rows.FirstOrDefault()
            ?? throw new QuestionError(QuestionErrorCode.NOT_FOUND, $"question {questionId} not found");
    }

    public const string TieBreakBucket = "cau-hoi-phu";

    public async Task<List<QuestionBankEntity>> TieBreakQuestionsAsync(int limit)
    {
        var where = new SqlWhere();
        where.Add("tags && string_to_array({0}, ',')", TieBreakBucket);
        where.Add("status = {0}::question_status", QuestionStatus.PUBLISHED.ToString());
        return await QueryRowsAsync(where, new Page(limit, 0));
    }

    public sealed record BucketCount(string Bucket, int N);

    public async Task<Dictionary<string, int>> BucketCountsAsync(QuestionStatus? status, string? search)
    {
        var where = new SqlWhere();
        if (status is { } st)
            where.Add("status = {0}::question_status", st.ToString());

        var searchTs = search is { } term ? QuestionSearchQuery(term) : null;
        if (searchTs is not null)
            where.Add("search_vector @@ to_tsquery('simple', immutable_unaccent({0}))", searchTs);

        var args = where.Args().ToList();
        var bucketIndex = args.Count;
        args.Add(string.Join(",", Buckets.AllBuckets));

        var sql = "SELECT bucket, count(*)::int AS n FROM ("
            + "SELECT COALESCE("
            + "(SELECT t FROM unnest(tags) AS t WHERE t = ANY(string_to_array({" + bucketIndex + "}, ',')) LIMIT 1), "
            + "payload ->> 'bucket', "
            + "CASE WHEN kind IN ('KEYWORD', 'HINT') THEN 'giai-ma' END"
            + ") AS bucket FROM question_bank"
            + where.Text()
            + ") AS rows WHERE bucket IS NOT NULL GROUP BY bucket";

        var items = await db.Database.SqlQueryRaw<BucketCount>(sql, args.ToArray()).ToListAsync();
        return items.ToDictionary(item => item.Bucket, item => item.N);
    }

    public sealed record QuestionUsage(Guid Id, Guid TournamentId, string Label, string StageId, string Status);

    public async Task<List<QuestionUsage>> QuestionUsageAsync(string questionId)
    {
        var needle = JsonSerializer.Serialize(new[] { new { sourceId = questionId } });
        return await db.Database
            .SqlQueryRaw<QuestionUsage>(
                """
                SELECT id, tournament_id, label, stage_id, status::text
                  FROM matches
                 WHERE deleted_at IS NULL
                   AND questions @> {0}::jsonb
                 ORDER BY updated_at DESC
                 LIMIT 20
                """,
                needle)
            .ToListAsync();
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
