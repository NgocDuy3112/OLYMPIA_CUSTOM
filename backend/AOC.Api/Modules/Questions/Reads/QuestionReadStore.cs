using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using AOC.Api.Http;
using AOC.Domain.Contracts;
using AOC.Infrastructure.Data;
using AOC.Infrastructure.Data.Entities;

namespace AOC.Api.Modules.Questions.Reads;

public sealed class QuestionReadStore(AOCDbContext db) : IQuestionReads
{
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
            clauses.Add("(kind = 'KEYWORD' OR (kind = 'TEXT' AND keyword_id IS NOT NULL))");
        clauses.Add("(cardinality(tags) = 0 AND payload ->> 'bucket' IS NULL AND NOT (kind = 'KEYWORD' OR (kind = 'TEXT' AND keyword_id IS NOT NULL)))");
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
        var usage = await AssignedMatchesAsync(rows.Select(row => row.Id).ToList());
        return Pagination.Result(rows.Select(row => WithUsage(row, usage)).ToList(), total, page);
    }

    public async Task<DateTime> RequireLockedUpdatedAtAsync(Guid questionId)
        => await db.Database
               .SqlQueryRaw<DateTime>(
                   "SELECT updated_at AS \"Value\" FROM question_bank WHERE id = {0} FOR UPDATE", questionId)
               .FirstOrDefaultAsync()
           is { } updatedAt && updatedAt != default
            ? updatedAt
            : throw new QuestionError(QuestionErrorCode.NOT_FOUND, $"question {questionId} not found");

    public async Task<QuestionRow> RequireAsync(string id)
    {
        var row = await db.QuestionBank.AsNoTracking().FirstOrDefaultAsync(q => q.Id == Guid.Parse(id))
           ?? throw new QuestionError(QuestionErrorCode.NOT_FOUND, $"question {id} not found");
        var usage = await AssignedMatchesAsync([row.Id]);
        return WithUsage(row, usage);
    }

    private static QuestionRow WithUsage(QuestionBankEntity row, Dictionary<Guid, List<QuestionUsage>> usage)
        => usage.TryGetValue(row.Id, out var matches)
            ? QuestionRow.Of(row) with { AssignedMatches = matches }
            : QuestionRow.Of(row);

    private async Task<Dictionary<Guid, List<QuestionUsage>>> AssignedMatchesAsync(List<Guid> sourceIds)
    {
        var result = new Dictionary<Guid, List<QuestionUsage>>();
        if (sourceIds.Count == 0) return result;

        var rows = await db.Database
            .SqlQueryRaw<QuestionUsageMatch>(
                """
                SELECT m.id AS match_id,
                       m.tournament_id AS tournament_id,
                       m.label AS label,
                       m.stage_id AS stage_id,
                       m.status::text AS status,
                       q ->> 'sourceId' AS source_id
                  FROM matches m
                  CROSS JOIN LATERAL jsonb_array_elements(m.questions) AS q
                 WHERE m.deleted_at IS NULL
                   AND q ->> 'sourceId' = ANY(string_to_array({0}, ','))
                 ORDER BY m.updated_at DESC
                """,
                string.Join(',', sourceIds.Select(id => id.ToString())))
            .ToListAsync();

        foreach (var row in rows)
        {
            if (!Guid.TryParse(row.SourceId, out var sourceId)) continue;
            if (!result.TryGetValue(sourceId, out var list))
            {
                list = [];
                result[sourceId] = list;
            }
            if (list.Any(item => item.Id == row.MatchId)) continue;
            list.Add(new QuestionUsage(row.MatchId, row.TournamentId, row.Label, row.StageId, row.Status));
        }

        return result;
    }

    private sealed record QuestionUsageMatch(
        Guid MatchId, Guid TournamentId, string Label, string StageId, string Status, string SourceId);

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

    public async Task<List<QuestionBankEntity>> TieBreakQuestionsAsync(int limit)
    {
        var where = new SqlWhere();
        where.Add("tags && string_to_array({0}, ',')", Buckets.TieBreakBucket);
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
            + "CASE WHEN kind = 'KEYWORD' OR (kind = 'TEXT' AND keyword_id IS NOT NULL) THEN 'giai-ma' END"
            + ") AS bucket FROM question_bank"
            + where.Text()
            + ") AS rows WHERE bucket IS NOT NULL GROUP BY bucket";

        var items = await db.Database.SqlQueryRaw<BucketCount>(sql, args.ToArray()).ToListAsync();
        return items.ToDictionary(item => item.Bucket, item => item.N);
    }
}
