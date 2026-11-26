using System.IO.Compression;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using AOC.Api.Http;
using AOC.Api.Modules.Matches;
using AOC.Domain.Contracts;
using AOC.Infrastructure.Data;
using AOC.Infrastructure.Media;

namespace AOC.Api.Modules.Questions;

public sealed class MatchDirectImportService(
    AOCDbContext db,
    QuestionsService questions,
    AssemblePatchService assemblePatch,
    ILogger<MatchDirectImportService> logger)
{
    public sealed record DirectImportResult(int Created, int AssemblyRevision);

    public sealed record ExcelUpload(byte[] Workbook, string? SourceName, List<MediaAttachment> Attachments);

    public static async Task<ExcelUpload> ReadBundleAsync(HttpContext http)
    {
        if (!http.Request.HasFormContentType)
        {
            using var ms = new MemoryStream();
            await http.Request.Body.CopyToAsync(ms);
            return new ExcelUpload(ms.ToArray(), null, []);
        }

        var form = await http.Request.ReadFormAsync();
        byte[]? workbook = null;
        string? sourceName = null;
        var attachments = new List<MediaAttachment>();

        foreach (var file in form.Files)
        {
            if (file.FileName.Length == 0) continue;
            byte[] content;
            await using (var ms = new MemoryStream())
            {
                await file.CopyToAsync(ms);
                content = ms.ToArray();
            }

            if (string.Equals(file.Name, "file", StringComparison.Ordinal))
            {
                if (file.FileName.ToLowerInvariant().EndsWith(".zip"))
                {
                    var unpacked = UnpackZip(content);
                    workbook = unpacked.Workbook;
                    sourceName = unpacked.SourceName;
                    attachments.AddRange(unpacked.Attachments);
                }
                else
                {
                    workbook = content;
                    sourceName = file.FileName;
                }
            }
            else
            {
                attachments.Add(new MediaAttachment(
                    MediaStorage.Basename(file.FileName), file.ContentType, content));
            }
        }

        if (workbook is null)
            throw new QuestionError(QuestionErrorCode.VALIDATION,
                "the upload needs the workbook as its \"file\" field",
                [$"{attachments.Count} media file(s) received"]);
        return new ExcelUpload(workbook, sourceName, attachments);
    }

    private static bool IsJunkEntry(string name)
    {
        if (name.Contains("__MACOSX/")) return true;
        var baseName = MediaStorage.Basename(name);
        if (baseName.Length == 0) return true;
        if (baseName == ".DS_Store") return true;
        return baseName.StartsWith("._");
    }

    private static ExcelUpload UnpackZip(byte[] content)
    {
        var oversized = new List<string>();
        var tooMany = false;
        var counted = 0;
        var files = new Dictionary<string, byte[]>();

        try
        {
            using var zip = new ZipArchive(new MemoryStream(content), ZipArchiveMode.Read);
            foreach (var entry in zip.Entries)
            {
                if (IsJunkEntry(entry.FullName)) continue;
                if (entry.Length > ExcelImport.MediaMaxBytes)
                {
                    oversized.Add(entry.FullName);
                    continue;
                }
                counted += 1;
                if (counted > ExcelImport.MediaMaxFiles + 1)
                {
                    tooMany = true;
                    continue;
                }
                using var stream = entry.Open();
                using var ms = new MemoryStream();
                stream.CopyTo(ms);
                files[entry.FullName] = ms.ToArray();
            }
        }
        catch (InvalidDataException)
        {
            throw new QuestionError(QuestionErrorCode.VALIDATION, "that file could not be read as .zip",
                ["a .zip bundle carries one .xlsx workbook plus its media"]);
        }

        if (oversized.Count > 0)
            throw new QuestionError(QuestionErrorCode.VALIDATION,
                "the zip carries a file larger than 64 MB", oversized);
        if (tooMany)
            throw new QuestionError(QuestionErrorCode.VALIDATION,
                $"the zip carries more than {ExcelImport.MediaMaxFiles} files",
                [$"at most {ExcelImport.MediaMaxFiles} media files plus one workbook"]);

        var names = files.Keys.ToList();
        var workbooks = names.Where(n => n.ToLowerInvariant().EndsWith(".xlsx")).ToList();

        if (workbooks.Count == 0)
            throw new QuestionError(QuestionErrorCode.VALIDATION, "the zip carries no .xlsx workbook",
                [names.Count > 0 ? $"{names.Count} other file(s) found" : "the zip is empty"]);
        if (workbooks.Count > 1)
            throw new QuestionError(QuestionErrorCode.VALIDATION,
                $"the zip carries {workbooks.Count} .xlsx files — keep exactly one",
                workbooks.Select(MediaStorage.Basename).ToList());

        var bookName = workbooks[0];
        var attachments = names
            .Where(name => name != bookName)
            .Select(name => new MediaAttachment(
                MediaStorage.Basename(name),
                MediaStorage.ContentTypeFor(name, null),
                files[name]))
            .ToList();

        return new ExcelUpload(files[bookName], MediaStorage.Basename(bookName), attachments);
    }

    private static string RefuseMessage(int count)
        => $"tệp import có {count} dòng chưa đạt — chưa ghi câu nào, sửa rồi gửi lại";

    private sealed record InsertOutcome(List<Guid> Ids, List<QuestionsService.BatchError> Errors,
        Dictionary<int, Guid> IdByIndex);

    private async Task<InsertOutcome> InsertAsync(QuestionsService.WriteContext ctx, ExcelImport.ParsedWorkbook parsed)
    {
        var inputs = parsed.Entries.Select(e => e.Mapped.Input!).ToList();

        var mainPositions = new List<int>();
        var hintPositions = new List<int>();
        for (var index = 0; index < inputs.Count; index++)
        {
            if (parsed.Entries[index].Mapped.IsHint) hintPositions.Add(index);
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
                var result = await questions.ImportQuestionsAsync(ctx,
                    slice.Select(i => JsonSerializer.SerializeToElement(i, JsonApi.Options)).ToList(),
                    false);
                for (var offset = 0; offset < result.Ids.Count; offset++)
                    idByIndex[positions[start + offset]] = result.Ids[offset];

                if (result.Errors.Count == 0) continue;
                errors.AddRange(result.Errors.Select(error => error with
                {
                    Index = positions[Math.Min(start + error.Index, positions.Count - 1)]
                }));
                return;
            }
        }

        await Run(mainPositions, null);

        if (errors.Count == 0)
        {
            if (hintPositions.Count > 0)
            {
                var keywordIndex = inputs.FindIndex(i => i.Kind == QuestionKind.KEYWORD);
                if (keywordIndex >= 0)
                {
                    if (idByIndex.TryGetValue(keywordIndex, out var keywordId))
                        await Run(hintPositions, keywordId);
                }
                else
                {
                    errors.Add(new QuestionsService.BatchError(0,
                        "VALIDATION", "hint rows need their GM_KEY row",
                        ["GM_1…GM_8 hang from the keyword that GM_KEY defines — fill GM_KEY first"]));
                }
            }
        }

        return new InsertOutcome(idByIndex.Values.ToList(), errors, idByIndex);
    }

    public async Task<DirectImportResult> ImportToMatchAsync(
        QuestionsService.WriteContext ctx, string tournamentId, string matchId,
        byte[] workbook, IReadOnlyList<MediaAttachment> attachments)
    {
        var parsed = ExcelImport.ParseWorkbook(workbook);

        if (parsed.Entries.Count == 0)
        {
            List<string> details;
            if (parsed.SheetNames.Count > 0)
                details = [$"sheets: {string.Join(", ", parsed.SheetNames)} — every row was empty"];
            else
                details = ["no sheets found"];
            throw new QuestionError(QuestionErrorCode.VALIDATION, "tệp này không có câu hỏi nào", details);
        }
        if (parsed.Entries.Count > ExcelImport.MaxImportRows)
            throw new QuestionError(QuestionErrorCode.VALIDATION,
                $"một lần import tối đa {ExcelImport.MaxImportRows} câu",
                [$"{parsed.Entries.Count} dòng đã điền trong tệp này"]);

        var failures = new List<RowDetail>();
        foreach (var entry in parsed.Entries)
        {
            if (entry.Mapped.Error is null) continue;
            failures.Add(new RowDetail(entry.Summary.Index, entry.Mapped.Error.Message));
        }

        var structural = ExcelImport.StructuralProblems(
            parsed.Entries.Select(e => (e.Summary.Index, e.Summary.Kind, e.Mapped.IsHint)).ToList());
        foreach (var problem in structural)
            failures.Add(new RowDetail(problem.Index, problem.Message));

        foreach (var duplicate in ExcelImport.DuplicatesInFile(parsed))
            failures.Add(new RowDetail(duplicate.Index, duplicate.Message));

        foreach (var mediaError in ExcelImport.AttachMedia(parsed, attachments))
            failures.Add(new RowDetail(mediaError.Index, mediaError.Message));

        var slots = new List<(int Index, Buckets.Slot Slot)>();
        foreach (var entry in parsed.Entries)
        {
            if (entry.Mapped.Input is null) continue;
            var bucket = entry.Mapped.Input.Tags?.FirstOrDefault();
            if (bucket is null)
            {
                failures.Add(new RowDetail(entry.Summary.Index,
                    $"dòng {entry.Summary.SourceId} chưa rõ thuộc nhóm nào — kiểm tra lại mã ID"));
                continue;
            }
            try
            {
                slots.Add((entry.Summary.Index, Buckets.SlotForBucket(bucket)));
            }
            catch (QuestionError slotError)
            {
                failures.Add(new RowDetail(entry.Summary.Index, slotError.Message));
            }
        }

        if (failures.Count > 0)
            throw new QuestionRowError(QuestionErrorCode.VALIDATION,
                RefuseMessage(failures.Count), failures.OrderBy(f => f.Index).ToList());

        var draftItems = parsed.Entries
            .Select(e => JsonSerializer.SerializeToElement(e.Mapped.Input!, JsonApi.Options))
            .ToList();
        var preflight = await questions.ImportQuestionsAsync(ctx, draftItems, true);
        if (preflight.Errors.Count > 0)
            throw new QuestionRowError(QuestionErrorCode.VALIDATION,
                RefuseMessage(preflight.Errors.Count),
                preflight.Errors
                    .Select(e => new RowDetail(e.Index, e.Message))
                    .OrderBy(r => r.Index)
                    .ToList());

        var uploads = await ExcelImport.UploadMediaAsync(parsed, logger);
        if (uploads.Count > 0)
            throw new QuestionRowError(QuestionErrorCode.VALIDATION,
                RefuseMessage(uploads.Count),
                uploads.Select(e => new RowDetail(e.Index, e.Message)).OrderBy(r => r.Index).ToList());

        var insertedIds = new List<Guid>();
        await using var tx = await db.Database.BeginTransactionAsync();
        try
        {
            var inserted = await InsertAsync(ctx, parsed);
            insertedIds.AddRange(inserted.Ids);
            if (inserted.Errors.Count > 0)
                throw new QuestionRowError(QuestionErrorCode.VALIDATION,
                    RefuseMessage(inserted.Errors.Count),
                    inserted.Errors
                        .Select(e => new RowDetail(e.Index, e.Message))
                        .OrderBy(r => r.Index)
                        .ToList());

            var match = await db.Matches.AsNoTracking()
                .FirstOrDefaultAsync(m => m.Id == Guid.Parse(matchId)
                    && m.TournamentId == Guid.Parse(tournamentId)
                    && m.DeletedAt == null)
                ?? throw new QuestionError(QuestionErrorCode.NOT_FOUND, $"match {matchId} not found");

            var existing = match.QuestionsList
                .Select(q => new AssemblyEntry(q.RoundId, q.TurnId, q.SourceId, null, q.Points))
                .ToList();

            var fresh = new List<AssemblyEntry>();
            for (var slotIndex = 0; slotIndex < slots.Count; slotIndex++)
            {
                var (index, slot) = slots[slotIndex];
                if (inserted.IdByIndex.TryGetValue(index, out var sourceId))
                    fresh.Add(new AssemblyEntry(slot.RoundId, slot.TurnId, sourceId.ToString(), null, slot.Points));
                else
                    throw new QuestionError(QuestionErrorCode.VALIDATION,
                        "một dòng đạt kiểm tra nhưng chưa thành câu hỏi",
                        [parsed.Entries[index].Summary.SourceId]);
            }

            var result = await assemblePatch.PatchAssembleAsync(tournamentId, matchId,
                new MatchSchemas.PatchAssembleInput(match.AssemblyRevision, [.. existing, .. fresh]),
                ctx.ActorId);

            await tx.CommitAsync();
            return new DirectImportResult(inserted.Ids.Count, result.AssemblyRevision);
        }
        catch (Exception error)
        {
            await tx.RollbackAsync();
            db.ChangeTracker.Clear();
            var orphans = await db.QuestionBank
                .Where(q => insertedIds.Contains(q.Id))
                .ToListAsync();
            var children = orphans.Where(q => q.KeywordId is not null).ToList();
            var parents = orphans.Where(q => q.KeywordId is null).ToList();
            db.QuestionBank.RemoveRange(children);
            db.QuestionBank.RemoveRange(parents);
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
                error is MatchError matchError ? matchError.Details.ToList() : []);
        }
    }
}
