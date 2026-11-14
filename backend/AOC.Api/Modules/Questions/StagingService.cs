using System.IO.Compression;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using AOC.Api.Http;
using AOC.Api.Modules.Matches;
using AOC.Api.Shared;
using AOC.Domain.Contracts;
using AOC.Infrastructure.Data;
using AOC.Infrastructure.Data.Entities;

namespace AOC.Api.Modules.Questions;

/// <summary>Port of questions/staging.ts — staged Excel batches.</summary>
public sealed class StagingService(AOCDbContext db, QuestionsService questions, AssemblePatchService assemblePatch)
{
    private static readonly string[] CellKeys = ["question", "answer", "explanation", "note", "media"];

    public sealed record StagedBatch(
        Guid Id, string? SourceName, int RowCount, int Ready, int ToFix, int Dropped,
        int Remaining, DateTime CreatedAt);

    public sealed record StagedRow(
        Guid Id, int Position, string Sheet, string SourceId, SourceCells Cells,
        Media? Media, string? Error, string? Warning, bool Dropped,
        string? Bucket, string? Kind);

    public sealed record RowPatch(Dictionary<string, string>? Cells, bool? Dropped);

    public sealed record CommitResult(int Created, List<Guid> Ids, List<QuestionsService.BatchError> Errors);

    public sealed record MatchCommitResult(int Created, List<Guid> Ids,
        List<QuestionsService.BatchError> Errors, int? AssemblyRevision);

    private static async Task<QuestionImportBatchEntity> RequireBatchAsync(AOCDbContext db, Guid batchId)
        => await db.QuestionImportBatches.AsNoTracking().FirstOrDefaultAsync(b => b.Id == batchId)
           ?? throw new QuestionError(QuestionErrorCode.NOT_FOUND, $"import {batchId} not found");

    public async Task<List<StagedBatch>> ListBatchesAsync()
    {
        await using var connection = await RawSql.OpenAsync(db);
        await using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT b.id,
                   b.source_name,
                   b.row_count,
                   b.created_at,
                   count(r.id) FILTER (WHERE r.error IS NULL AND NOT r.dropped)::int AS ready,
                   count(r.id) FILTER (WHERE r.error IS NOT NULL AND NOT r.dropped)::int AS "toFix",
                   count(r.id) FILTER (WHERE r.dropped)::int AS dropped,
                   count(r.id)::int AS remaining
              FROM question_import_batches b
              LEFT JOIN question_import_rows r ON r.batch_id = b.id
             GROUP BY b.id
             ORDER BY b.created_at DESC
             LIMIT 20
            """;

        var batches = new List<StagedBatch>();
        await using var reader = await command.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            batches.Add(new StagedBatch(
                Id: reader.GetGuid(0),
                SourceName: reader.IsDBNull(1) ? null : reader.GetString(1),
                RowCount: reader.GetInt32(2),
                Ready: reader.GetInt32(4),
                ToFix: reader.GetInt32(5),
                Dropped: reader.GetInt32(6),
                Remaining: reader.GetInt32(7),
                CreatedAt: reader.GetDateTime(3)));
        }
        return batches;
    }

    public async Task<StagedBatch?> ActiveBatchAsync()
    {
        var batches = await ListBatchesAsync();
        return batches.FirstOrDefault(b => b.Remaining > 0);
    }

    private static ExcelImport.MappedRow? MapFor(QuestionImportRowEntity row)
        => ExcelImport.MapSourceRow(row.Sheet, null, row.SourceId, row.CellsObject, row.Position);

    public async Task<List<StagedRow>> ListRowsAsync(string batchId)
    {
        var bid = Guid.Parse(batchId);
        await RequireBatchAsync(db, bid);
        var rows = await db.QuestionImportRows.AsNoTracking()
            .Where(r => r.BatchId == bid)
            .OrderBy(r => r.Position)
            .ToListAsync();

        return rows.Select(row =>
        {
            var mapped = MapFor(row);
            return new StagedRow(
                row.Id, row.Position, row.Sheet, row.SourceId, row.CellsObject,
                row.MediaObject, row.Error, row.Warning, row.Dropped,
                mapped?.Input?.Tags?.FirstOrDefault(), mapped?.Input?.Kind.ToString());
        }).ToList();
    }

    public async Task<StagedRow> UpdateRowAsync(string batchId, string rowId, RowPatch patch)
    {
        var bid = Guid.Parse(batchId);
        var rid = Guid.Parse(rowId);
        await RequireBatchAsync(db, bid);

        var row = await db.QuestionImportRows
            .FirstOrDefaultAsync(r => r.Id == rid && r.BatchId == bid)
            ?? throw new QuestionError(QuestionErrorCode.NOT_FOUND, $"row {rowId} not found");

        var cells = row.CellsObject;
        if (patch.Cells is not null)
        {
            var dict = new Dictionary<string, string>
            {
                ["question"] = cells.Question,
                ["answer"] = cells.Answer,
                ["explanation"] = cells.Explanation,
                ["note"] = cells.Note,
                ["media"] = cells.Media
            };
            foreach (var (key, value) in patch.Cells)
                if (CellKeys.Contains(key))
                    dict[key] = value;
            cells = new SourceCells
            {
                Question = dict["question"],
                Answer = dict["answer"],
                Explanation = dict["explanation"],
                Note = dict["note"],
                Media = dict["media"]
            };
        }

        var mediaChanged = patch.Cells is not null && patch.Cells.ContainsKey("media")
            && patch.Cells["media"] != row.CellsObject.Media;

        var mapped = ExcelImport.MapSourceRow(row.Sheet, null, row.SourceId, cells, row.Position);
        string? error;
        if (mapped is null)
        {
            error = "this row is empty — drop it, or fill in a question and an answer";
        }
        else
        {
            error = mapped.Error?.Message;
        }

        row.Cells = JsonDefaults.Serialize(cells);
        row.Error = error;
        row.Warning = mapped?.Warning;
        if (patch.Dropped is not null) row.Dropped = patch.Dropped.Value;
        if (mediaChanged) row.Media = null;
        row.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        return new StagedRow(
            row.Id, row.Position, row.Sheet, row.SourceId, cells,
            row.MediaObject, row.Error, row.Warning, row.Dropped,
            mapped?.Input?.Tags?.FirstOrDefault(), mapped?.Input?.Kind.ToString());
    }

    public async Task<StagedRow> AddRowAsync(string batchId, string sheet, string sourceId, SourceCells cells)
    {
        var bid = Guid.Parse(batchId);
        var batch = await RequireBatchAsync(db, bid);

        var mapped = ExcelImport.MapSourceRow(sheet, null, sourceId, cells, batch.RowCount);
        if (mapped is null)
            throw new QuestionError(QuestionErrorCode.VALIDATION, "an empty row cannot be added",
                ["fill in a question and an answer"]);

        var lastPosition = await db.QuestionImportRows.AsNoTracking()
            .Where(r => r.BatchId == bid)
            .OrderByDescending(r => r.Position)
            .Select(r => (int?)r.Position)
            .FirstOrDefaultAsync();

        var row = new QuestionImportRowEntity
        {
            BatchId = bid,
            Position = (lastPosition ?? -1) + 1,
            Sheet = sheet,
            SourceId = sourceId,
            Cells = JsonDefaults.Serialize(cells),
            Error = mapped.Error?.Message,
            Warning = mapped.Warning
        };
        db.QuestionImportRows.Add(row);
        await db.SaveChangesAsync();

        return new StagedRow(
            row.Id, row.Position, row.Sheet, row.SourceId, cells,
            row.MediaObject, row.Error, row.Warning, row.Dropped,
            mapped.Input?.Tags?.FirstOrDefault(), mapped.Input?.Kind.ToString());
    }

    public async Task DiscardBatchAsync(string batchId)
    {
        var bid = Guid.Parse(batchId);
        await RequireBatchAsync(db, bid);
        // question_import_rows.batch_id is ON DELETE CASCADE in the schema, but EF
        // does not model that FK and orders the header DELETE first: the rows then
        // vanish via cascade, so EF's own row DELETEs affect 0 rows →
        // DbUpdateConcurrencyException → everything rolls back. Delete only the
        // header and let the database cascade the rows.
        var header = await db.QuestionImportBatches.FirstAsync(b => b.Id == bid);
        db.QuestionImportBatches.Remove(header);
        await db.SaveChangesAsync();
    }

    private sealed record Prepared(List<(QuestionImportRowEntity Row, QuestionsService.CreateQuestionDto Input)> Rows);

    private async Task<object> PrepareCommitAsync(string batchId)
    {
        var bid = Guid.Parse(batchId);
        await RequireBatchAsync(db, bid);

        var staged = await db.QuestionImportRows.AsNoTracking()
            .Where(r => r.BatchId == bid && !r.Dropped)
            .OrderBy(r => r.Position)
            .ToListAsync();

        if (staged.Count == 0)
            throw new QuestionError(QuestionErrorCode.VALIDATION, "this batch has nothing left to commit",
                ["every row was dropped — discard the batch instead"]);

        var errors = new List<QuestionsService.BatchError>();
        var rows = new List<(QuestionImportRowEntity Row, QuestionsService.CreateQuestionDto Input)>();

        foreach (var row in staged)
        {
            var mapped = MapFor(row);
            if (mapped is null)
            {
                errors.Add(new QuestionsService.BatchError(row.Position, "VALIDATION",
                    "this row is empty — drop it, or fill in a question and an answer",
                    [$"{row.Sheet} ({row.SourceId})"]));
                continue;
            }
            if (mapped.Error is not null)
            {
                errors.Add(mapped.Error);
                continue;
            }
            rows.Add((Row: row, Input: mapped.Input!));
        }

        var structural = ExcelImport.StructuralProblems(
            rows.Select((entry, index) => (index, entry.Item2.Kind.ToString())).ToList());
        foreach (var problem in structural)
        {
            var position = rows.Count > problem.Index ? rows[problem.Index].Row.Position : (int?)null;
            if (position is null) continue;
            errors.Add(problem with { Index = position.Value });
        }

        if (errors.Count > 0)
            return errors.OrderBy(e => e.Index).ToList();
        return new Prepared(rows);
    }

    private sealed record InsertOutcome(List<Guid> Ids, List<QuestionsService.BatchError> Errors,
        Dictionary<int, Guid> IdByIndex);

    private async Task<InsertOutcome> InsertPreparedAsync(
        QuestionsService.WriteContext ctx, Guid batchId, Prepared prepared)
    {
        var inputs = prepared.Rows
            .Select(entry => entry.Row.MediaObject is { } media
                ? entry.Item2 with { Media = media }
                : entry.Item2)
            .ToList();

        var mainPositions = new List<int>();
        var hintPositions = new List<int>();
        for (var index = 0; index < inputs.Count; index++)
        {
            if (inputs[index].Kind == QuestionKind.HINT) hintPositions.Add(index);
            else mainPositions.Add(index);
        }

        var idByIndex = new Dictionary<int, Guid>();
        var errors = new List<QuestionsService.BatchError>();

        async Task Run(List<int> positions, Guid? keywordId)
        {
            var items = positions.Select(index =>
            {
                var input = inputs[index];
                return keywordId is { } kw ? input with { KeywordId = kw.ToString() } : input;
            }).ToList();

            for (var start = 0; start < items.Count; start += 100)
            {
                var slice = items.Skip(start).Take(100).ToList();
                var result = await questions.ImportQuestionsAsync(
                    ctx with { ImportBatchId = batchId },
                    slice.Select(i => JsonSerializer.SerializeToElement(i, JsonApi.Options)).ToList(),
                    false);
                for (var offset = 0; offset < result.Ids.Count; offset++)
                    idByIndex[positions[start + offset]] = result.Ids[offset];

                if (result.Errors.Count > 0)
                {
                    errors.AddRange(result.Errors.Select(error => error with
                    {
                        Index = positions[Math.Min(start + error.Index, positions.Count - 1)]
                    }));
                    return;
                }
            }
        }

        await Run(mainPositions, null);

        if (errors.Count == 0 && hintPositions.Count > 0)
        {
            var keywordIndex = inputs.FindIndex(i => i.Kind == QuestionKind.KEYWORD);
            if (keywordIndex >= 0 && idByIndex.TryGetValue(keywordIndex, out var keywordId))
            {
                await Run(hintPositions, keywordId);
            }
            else
            {
                errors.Add(new QuestionsService.BatchError(
                    keywordIndex >= 0 ? prepared.Rows[keywordIndex].Row.Position : 0,
                    "VALIDATION", "hint rows need their GM_KEY row", ["the keyword could not be inserted"]));
            }
        }

        return new InsertOutcome(idByIndex.Values.ToList(), errors, idByIndex);
    }

    private async Task ForgetRowsAsync(Guid batchId)
    {
        var rows = await db.QuestionImportRows.Where(r => r.BatchId == batchId).ToListAsync();
        db.QuestionImportRows.RemoveRange(rows);
        await db.SaveChangesAsync();
    }

    public async Task<CommitResult> CommitBatchAsync(QuestionsService.WriteContext ctx, string batchId)
    {
        var bid = Guid.Parse(batchId);
        var prepare = await PrepareCommitAsync(batchId);
        if (prepare is List<QuestionsService.BatchError> errors)
            return new CommitResult(0, [], errors);

        var prepared = (Prepared)prepare;
        var inserted = await InsertPreparedAsync(ctx, bid, prepared);
        if (inserted.Errors.Count > 0)
            return new CommitResult(inserted.Ids.Count, inserted.Ids, inserted.Errors);

        await ForgetRowsAsync(bid);
        return new CommitResult(inserted.Ids.Count, inserted.Ids, []);
    }

    public async Task<MatchCommitResult> CommitBatchToMatchAsync(
        QuestionsService.WriteContext ctx, string batchId, string tournamentId, string matchId)
    {
        var bid = Guid.Parse(batchId);
        var prepare = await PrepareCommitAsync(batchId);
        if (prepare is List<QuestionsService.BatchError> errors)
            return new MatchCommitResult(0, [], errors, null);

        var prepared = (Prepared)prepare;
        var inserted = await InsertPreparedAsync(ctx, bid, prepared);
        if (inserted.Errors.Count > 0)
            return new MatchCommitResult(inserted.Ids.Count, inserted.Ids, inserted.Errors, null);

        try
        {
            // Publish everything this batch created.
            var idStrings = inserted.Ids.Select(id => id.ToString()).ToList();
            var created = await db.QuestionBank.Where(q => inserted.Ids.Contains(q.Id)).ToListAsync();
            foreach (var row in created)
            {
                row.Status = QuestionStatus.PUBLISHED;
                row.UpdatedAt = DateTime.UtcNow;
            }
            await db.SaveChangesAsync();

            var match = await db.Matches.AsNoTracking()
                .FirstAsync(m => m.Id == Guid.Parse(matchId) && m.TournamentId == Guid.Parse(tournamentId));

            var existing = match.QuestionsList
                .Select(q => new AssemblyEntry(q.RoundId, q.TurnId, q.SourceId, null, q.Points))
                .ToList();

            var fresh = new List<AssemblyEntry>();
            for (var index = 0; index < prepared.Rows.Count; index++)
            {
                var input = prepared.Rows[index].Item2;
                var bucket = input.Tags?.FirstOrDefault();
                if (bucket is null)
                    throw new QuestionError(QuestionErrorCode.VALIDATION, "a staged row has no bucket",
                        [$"{input.QuestionText[..Math.Min(40, input.QuestionText.Length)]} — re-tag it before committing"]);
                var slot = Buckets.SlotForBucket(bucket);
                if (slot.TurnId is null)
                    throw new QuestionError(QuestionErrorCode.VALIDATION,
                        $"no match slot for bucket \"{bucket}\"");
                if (!inserted.IdByIndex.TryGetValue(index, out var sourceId))
                    throw new QuestionError(QuestionErrorCode.VALIDATION,
                        "a staged row did not become a question",
                        [input.QuestionText[..Math.Min(40, input.QuestionText.Length)]]);
                fresh.Add(new AssemblyEntry(slot.RoundId, slot.TurnId, sourceId.ToString(), null, slot.Points));
            }

            var result = await assemblePatch.PatchAssembleAsync(tournamentId, matchId,
                new MatchSchemas.PatchAssembleInput(match.AssemblyRevision, [.. existing, .. fresh]),
                ctx.ActorId);

            await ForgetRowsAsync(bid);
            return new MatchCommitResult(inserted.Ids.Count, inserted.Ids, [], result.AssemblyRevision);
        }
        catch (Exception error)
        {
            db.ChangeTracker.Clear();
            // Roll back the questions this batch created (only ones tagged with this batch).
            var rollback = await db.QuestionBank
                .Where(q => inserted.Ids.Contains(q.Id) && q.ImportBatchId == bid)
                .ToListAsync();
            db.QuestionBank.RemoveRange(rollback);
            await db.SaveChangesAsync();

            if (error is QuestionError) throw;
            var code = error switch
            {
                MatchError { Code: MatchErrorCode.NOT_FOUND } => QuestionErrorCode.NOT_FOUND,
                MatchError { Code: MatchErrorCode.IMMUTABLE } => QuestionErrorCode.IMMUTABLE,
                MatchError { Code: MatchErrorCode.FORBIDDEN } => QuestionErrorCode.FORBIDDEN,
                _ => QuestionErrorCode.VALIDATION
            };
            throw new QuestionError(code, error.Message,
                error is MatchError me ? me.Details.ToList() : []);
        }
    }
}
