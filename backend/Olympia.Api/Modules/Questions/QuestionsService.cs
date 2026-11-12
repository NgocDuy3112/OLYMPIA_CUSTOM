using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Olympia.Api.Http;
using Olympia.Api.Shared;
using Olympia.Domain.Contracts;
using Olympia.Infrastructure.Configuration;
using Olympia.Infrastructure.Data;
using Olympia.Infrastructure.Data.Entities;

namespace Olympia.Api.Modules.Questions;

/// <summary>Port of questions/transitions.ts.</summary>
public static class Transitions
{
    private static readonly Dictionary<QuestionStatus, QuestionStatus[]> Edges = new()
    {
        [QuestionStatus.DRAFT] = [QuestionStatus.PENDING, QuestionStatus.ARCHIVED],
        [QuestionStatus.PENDING] = [QuestionStatus.DRAFT, QuestionStatus.PUBLISHED, QuestionStatus.ARCHIVED],
        [QuestionStatus.PUBLISHED] = [QuestionStatus.PENDING, QuestionStatus.ARCHIVED],
        [QuestionStatus.ARCHIVED] = []
    };

    private static readonly HashSet<string> AdminOnly = ["PENDING→PUBLISHED"];

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

/// <summary>Port of questions/payload.ts.</summary>
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

/// <summary>Port of questions/service.ts.</summary>
public sealed class QuestionsService(OlympiaDbContext db)
{
    public const int MaxBatchSize = 500;
    private const int MaxPageSize = 500;
    private const int HintsPerSet = 8;
    private const int BatchInsertChunk = 100;

    public sealed record WriteContext(Guid ActorId, Guid? ImportBatchId = null);

    public sealed record BatchError(int Index, string Code, string Message, List<string> Details);

    public sealed record BatchReport(
        bool DryRun, int Total, int Created, List<Guid> Ids, List<BatchError> Errors);

    // ---- lookups -----------------------------------------------------------------

    public async Task<QuestionBankEntity> RequireQuestionAsync(string id)
        => await db.QuestionBank.AsNoTracking().FirstOrDefaultAsync(q => q.Id == Guid.Parse(id))
           ?? throw new QuestionError(QuestionErrorCode.NOT_FOUND, $"question {id} not found");

    // ---- create -------------------------------------------------------------------

    private static QuestionType DeriveType(QuestionKind kind, JsonElement payload)
    {
        if (payload.ValueKind == JsonValueKind.Object
            && payload.TryGetProperty("type", out var declared)
            && declared.ValueKind == JsonValueKind.String
            && Enum.TryParse<QuestionType>(declared.GetString(), out var parsed))
            return parsed;
        return kind == QuestionKind.HINT ? QuestionType.TEXT : (QuestionType)(int)kind;
    }

    private static List<string>? NormalizeTags(List<string>? tags)
    {
        if (tags is null) return null;
        if (tags.Count == 0) return [];
        Buckets.RequireBucketTag(tags);
        return tags;
    }

    private static JsonElement ScopedPayload(QuestionType type, JsonElement payload, List<string>? tags)
    {
        var stamped = Buckets.PayloadWithType(type, payload);
        if (Buckets.BucketOfTags(tags) is null) return stamped;

        var dict = stamped.Deserialize<Dictionary<string, JsonElement>>()!;
        dict.Remove("bucket");
        return JsonSerializer.SerializeToElement(dict, JsonApi.Options);
    }

    private QuestionBankEntity QuestionValues(WriteContext ctx, CreateQuestionDto input)
    {
        var type = DeriveType(input.Kind, input.Payload);
        var tags = NormalizeTags(input.Tags) ?? [];
        return new QuestionBankEntity
        {
            Kind = input.Kind,
            QuestionText = input.QuestionText,
            KeywordId = input.KeywordId is null ? null : Guid.Parse(input.KeywordId),
            Payload = ScopedPayload(type, input.Payload, tags),
            Tags = tags.ToArray(),
            Media = input.Media is null ? null : JsonDefaults.Serialize(input.Media),
            TimeLimit = input.TimeLimit,
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
        if (input.TimeLimit is not null && input.TimeLimit < 1)
            throw new QuestionError(QuestionErrorCode.VALIDATION,
                "Question payload failed validation", ["/timeLimit: Number must be >= 1"]);
        if (input.Tags is { Count: > 8 })
            throw new QuestionError(QuestionErrorCode.VALIDATION,
                "Question payload failed validation", ["/tags: Array must have at most 8 items"]);
        if (input.KeywordId is not null && !Guid.TryParse(input.KeywordId, out _))
            throw new QuestionError(QuestionErrorCode.VALIDATION,
                "Question payload failed validation", ["/keywordId: Expected string with format 'uuid'"]);

        Buckets.AssertPayloadForType(DeriveType(input.Kind, input.Payload), input.Payload);
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
            TimeLimit = source.TimeLimit,
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
            var type = DeriveType(kindPatch ?? existing.Kind, payloadEl);
            Buckets.AssertPayloadForType(type, payloadEl);
            payloadPatch = Buckets.PayloadWithType(type, payloadEl);
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
        if (patchInput.TryGetProperty("timeLimit", out var tl))
            tracked.TimeLimit = tl.ValueKind switch
            {
                JsonValueKind.Null => null,
                JsonValueKind.Number when tl.TryGetInt32(out var n) && n >= 1 => n,
                _ => throw QuestionPayloadInvalid("/timeLimit: Number must be >= 1")
            };
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

    // ---- search & listing -----------------------------------------------------------

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
            "tags && @bucketValues::text[]",
            "payload ->> 'bucket' = ANY(@bucketValues)"
        };
        if (Buckets.ExpandBucketParam(bucket).Contains("giai-ma"))
            clauses.Add("kind IN ('KEYWORD', 'HINT')");
        clauses.Add("(tags = '{}' AND payload ->> 'bucket' IS NULL AND kind NOT IN ('KEYWORD', 'HINT'))");
        return string.Join(" OR ", clauses.Select(c => $"({c})"));
    }

    public sealed record ListFilters(
        QuestionStatus? Status = null,
        QuestionKind? Kind = null,
        Guid? KeywordId = null,
        string? Search = null,
        List<Guid>? Ids = null,
        string? Cursor = null,
        string? Bucket = null);

    private static string Escape(string value) => value.Replace("'", "''");

    private sealed record SqlFilter(List<string> Where, List<(string Name, object Value)> Params)
    {
        public void Add(string clause, params (string Name, object Value)[] parameters)
        {
            Where.Add(clause);
            Params.AddRange(parameters);
        }
    }

    private static string OrderClause(string? searchTs, bool cursor)
    {
        if (searchTs is not null)
            return "ORDER BY ts_rank(search_vector, to_tsquery('simple', immutable_unaccent(@tsq))) DESC, created_at DESC, id DESC";
        return cursor
            ? "ORDER BY created_at DESC, id DESC"
            : "ORDER BY created_at DESC, id DESC";
    }

    private static QuestionBankEntity Materialize(System.Data.Common.DbDataReader reader) => new()
    {
        Id = reader.GetGuid(0),
        // kind/status come back as ::text (see SelectColumns): RawSql's pooled
        // connection is a plain NpgsqlConnection with no MapEnum registrations,
        // so GetFieldValue<QuestionKind> on a native PG enum fails with
        // "DataTypeName '-.-' not supported". Parse from the label instead.
        Kind = Enum.Parse<QuestionKind>(reader.GetString(1)),
        QuestionText = reader.GetString(2),
        KeywordId = reader.IsDBNull(3) ? null : reader.GetGuid(3),
        Media = reader.IsDBNull(4) ? null : reader.GetFieldValue<JsonElement>(4),
        Payload = reader.GetFieldValue<JsonElement>(5),
        TimeLimit = reader.IsDBNull(6) ? null : reader.GetInt32(6),
        Status = Enum.Parse<QuestionStatus>(reader.GetString(7)),
        Tags = reader.GetFieldValue<string[]>(8),
        Type = reader.IsDBNull(9) ? "" : reader.GetString(9),
        CreatedBy = reader.GetGuid(10),
        ImportBatchId = reader.IsDBNull(11) ? null : reader.GetGuid(11),
        CreatedAt = reader.GetDateTime(12),
        UpdatedAt = reader.GetDateTime(13)
    };

    private const string SelectColumns = """
        SELECT id, kind::text, question_text, keyword_id, media, payload, time_limit, status::text,
               tags, type, created_by, import_batch_id, created_at, updated_at
          FROM question_bank
        """;

    private async Task<List<QuestionBankEntity>> QueryRowsAsync(
        SqlFilter filter, string order, int limit, int offset, Dictionary<string, object>? extra = null)
    {
        var sql = SelectColumns;
        if (filter.Where.Count > 0) sql += " WHERE " + string.Join(" AND ", filter.Where);
        sql += $" {order} LIMIT @limit OFFSET @offset";

        await using var connection = await RawSql.OpenAsync(db);
        await using var command = connection.CreateCommand();
        command.CommandText = sql;
        AddParam(command, "limit", limit);
        AddParam(command, "offset", offset);
        foreach (var (name, value) in filter.Params) AddParam(command, name, value);
        if (extra is not null)
            foreach (var (name, value) in extra) AddParam(command, name, value);

        var rows = new List<QuestionBankEntity>();
        await using var reader = await command.ExecuteReaderAsync();
        while (await reader.ReadAsync()) rows.Add(Materialize(reader));
        return rows;
    }

    private async Task<int> CountRowsAsync(SqlFilter filter, Dictionary<string, object>? extra = null)
    {
        var sql = "SELECT count(*)::int FROM question_bank";
        if (filter.Where.Count > 0) sql += " WHERE " + string.Join(" AND ", filter.Where);

        await using var connection = await RawSql.OpenAsync(db);
        await using var command = connection.CreateCommand();
        command.CommandText = sql;
        foreach (var (name, value) in filter.Params) AddParam(command, name, value);
        if (extra is not null)
            foreach (var (name, value) in extra) AddParam(command, name, value);
        return Convert.ToInt32(await command.ExecuteScalarAsync());
    }

    private static void AddParam(System.Data.Common.DbCommand command, string name, object value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.Value = value;
        command.Parameters.Add(parameter);
    }

    private async Task<(SqlFilter Filter, string? SearchTs, string Order)> BuildFilterAsync(ListFilters filters)
    {
        string? searchTs;
        string order;
        var filter = new SqlFilter([], []);
        // Enum columns are compared via typed casts: RawSql's plain connection
        // sends .ToString() params as text, and PG has no enum=text operator
        // (42883 "operator does not exist"). Literals like 'PUBLISHED' are fine
        // (PG coerces unknown literals to the enum) — only parameters need this.
        if (filters.Status is { } status)
            filter.Add("status = @status::question_status", ("status", status.ToString()));
        if (filters.Kind is { } kind)
            filter.Add("kind = @kind::question_kind", ("kind", kind.ToString()));
        if (filters.KeywordId is { } kw) filter.Add("keyword_id = @keywordId", ("keywordId", kw));
        if (filters.Ids is { Count: > 0 } ids)
            filter.Add("id::text = ANY(@ids)", ("ids", ids.Select(g => g.ToString()).ToArray()));

        searchTs = filters.Search is { } term ? QuestionSearchQuery(term) : null;
        if (searchTs is not null)
            filter.Add("search_vector @@ to_tsquery('simple', immutable_unaccent(@tsq))", ("tsq", searchTs));

        if (filters.Bucket is not null)
        {
            var list = Buckets.ExpandBucketParam(filters.Bucket);
            filter.Add($"({BucketConditionSql(filters.Bucket)})",
                ("bucketValues", list.ToArray()));
        }

        if (filters.Cursor is not null && searchTs is null)
        {
            var cursor = Guid.Parse(filters.Cursor);
            var row = await db.QuestionBank.AsNoTracking()
                .Where(x => x.Id == cursor)
                .Select(x => new { x.CreatedAt, x.Id })
                .FirstOrDefaultAsync();
            if (row is not null)
            {
                filter.Add("(created_at < @cursorAt OR (created_at = @cursorAt AND id < @cursorId))",
                    ("cursorAt", row.CreatedAt), ("cursorId", row.Id));
            }
        }

        order = OrderClause(searchTs, filters.Cursor is not null);
        return (filter, searchTs, order);
    }

    public async Task<PageResult<QuestionBankEntity>> ListQuestionsAsync(ListFilters filters, Page page)
    {
        var (filter, searchTs, order) = await BuildFilterAsync(filters);
        var extra = searchTs is not null ? new Dictionary<string, object> { ["tsq"] = searchTs } : null;

        // Count ignores the cursor, like the TS source.
        var countFilter = new SqlFilter(filter.Where.Where(w => !w.Contains("cursorAt")).ToList(),
            filter.Params.Where(p => p.Name is not ("cursorAt" or "cursorId")).ToList());
        var total = await CountRowsAsync(countFilter, extra);
        var items = await QueryRowsAsync(filter, order, page.Limit, page.Offset, extra);
        return Pagination.Result(items, total, page);
    }

    public async Task<PageResult<QuestionBankEntity>> ListForAssemblyAsync(
        List<QuestionKind>? kinds, string? bucket, string? search, Page page)
    {
        var filter = new SqlFilter([], []);
        filter.Add("status = 'PUBLISHED'");
        if (kinds is { Count: > 0 })
            filter.Add("kind::text = ANY(@kinds)", ("kinds", kinds.Select(k => k.ToString()).ToArray()));
        if (bucket is not null)
            filter.Add($"({BucketConditionSql(bucket)})", ("bucketValues", Buckets.ExpandBucketParam(bucket).ToArray()));

        var searchTs = search is { } s ? QuestionSearchQuery(s) : null;
        if (searchTs is not null)
            filter.Add("search_vector @@ to_tsquery('simple', immutable_unaccent(@tsq))", ("tsq", searchTs));

        var extra = searchTs is not null ? new Dictionary<string, object> { ["tsq"] = searchTs } : null;
        var total = await CountRowsAsync(filter, extra);
        var items = await QueryRowsAsync(filter, OrderClause(searchTs, false), page.Limit, page.Offset, extra);
        return Pagination.Result(items, total, page);
    }

    public async Task<PageResult<QuestionBankEntity>> ListForAgentAsync(
        QuestionKind? kind, string? search, Page page)
    {
        var filter = new SqlFilter([], []);
        filter.Add("status IN ('PUBLISHED', 'ARCHIVED')");
        if (kind is { } k) filter.Add("kind = @kind::question_kind", ("kind", k.ToString()));

        var searchTs = search is { } s ? QuestionSearchQuery(s) : null;
        if (searchTs is not null)
            filter.Add("search_vector @@ to_tsquery('simple', immutable_unaccent(@tsq))", ("tsq", searchTs));

        var extra = searchTs is not null ? new Dictionary<string, object> { ["tsq"] = searchTs } : null;
        var total = await CountRowsAsync(filter, extra);
        var items = await QueryRowsAsync(filter, OrderClause(searchTs, false), page.Limit, page.Offset, extra);
        return Pagination.Result(items, total, page);
    }

    public async Task<QuestionBankEntity> GetForAgentAsync(string questionId)
    {
        var id = Guid.Parse(questionId);
        var filter = new SqlFilter([], []);
        filter.Add("id = @id", ("id", id));
        filter.Add("status IN ('PUBLISHED', 'ARCHIVED')");
        var rows = await QueryRowsAsync(filter, "", 1, 0);
        return rows.FirstOrDefault()
            ?? throw new QuestionError(QuestionErrorCode.NOT_FOUND, $"question {questionId} not found");
    }

    public async Task<Dictionary<string, int>> BucketCountsAsync(QuestionStatus? status, string? search)
    {
        var searchTs = search is { } term ? QuestionSearchQuery(term) : null;

        // The bucket expression is SQL-side; run one raw query like the TS source.
        await using var connection = await RawSql.OpenAsync(db);
        await using var command = connection.CreateCommand();
        var where = new List<string>();
        if (status is { } st) where.Add($"status = '{st}'");
        if (searchTs is not null)
            where.Add($"search_vector @@ to_tsquery('simple', immutable_unaccent('{searchTs.Replace("'", "''")}'))");
        var values = string.Join(", ", Buckets.AllBuckets.Select(b => $"'{b}'"));
        command.CommandText = $"""
            SELECT bucket, count(*)::int AS n
              FROM (
                SELECT COALESCE(
                    (SELECT t FROM unnest(tags) AS t WHERE t IN ({values}) LIMIT 1),
                    payload ->> 'bucket',
                    CASE WHEN kind IN ('KEYWORD', 'HINT') THEN 'giai-ma' END
                  ) AS bucket
                  FROM question_bank
                 WHERE {(where.Count > 0 ? string.Join(" AND ", where) : "TRUE")}
              ) AS rows
             WHERE bucket IS NOT NULL
             GROUP BY bucket
            """;

        var counts = new Dictionary<string, int>();
        await using var reader = await command.ExecuteReaderAsync();
        while (await reader.ReadAsync())
            counts[reader.GetString(0)] = reader.GetInt32(1);
        return counts;
    }

    public sealed record QuestionUsage(Guid Id, Guid TournamentId, string Label, string StageId, string Status);

    public async Task<List<QuestionUsage>> QuestionUsageAsync(string questionId)
    {
        var needle = JsonSerializer.Serialize(new[] { new { sourceId = questionId } });
        await using var connection = await RawSql.OpenAsync(db);
        await using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT id, tournament_id, label, stage_id, status::text
              FROM matches
             WHERE deleted_at IS NULL
               AND questions @> @needle::jsonb
             ORDER BY updated_at DESC
             LIMIT 20
            """;
        var parameter = command.CreateParameter();
        parameter.ParameterName = "needle";
        parameter.Value = needle;
        command.Parameters.Add(parameter);

        var items = new List<QuestionUsage>();
        await using var reader = await command.ExecuteReaderAsync();
        while (await reader.ReadAsync())
            items.Add(new QuestionUsage(reader.GetGuid(0), reader.GetGuid(1),
                reader.GetString(2), reader.GetString(3), reader.GetString(4)));
        return items;
    }

    // ---- batch import ----------------------------------------------------------------

    public sealed record CreateQuestionDto(
        QuestionKind Kind,
        string QuestionText,
        string? KeywordId,
        JsonElement Payload,
        Media? Media,
        int? TimeLimit,
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

        var timeLimit = Validate.OptionalInt(input, "timeLimit", min: 1);

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

        return new CreateQuestionDto(kind, questionText, keywordId, payloadClone, media, timeLimit, tags);
    }

    /// <summary>Canonical fingerprint used for duplicate detection (fingerprint()).</summary>
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
            var typed = DeriveType(Enum.Parse<QuestionKind>(kind), payload);
            var stamped = Buckets.PayloadWithType(typed, payload);
            var dict = stamped.Deserialize<Dictionary<string, JsonElement>>()!;
            dict.Remove("bucket");
            canonicalPayload = JsonSerializer.SerializeToElement(dict, JsonApi.Options);
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

        // In-batch duplicates.
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
