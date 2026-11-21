using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using System.Text.Json;
using ClosedXML.Excel;
using Microsoft.EntityFrameworkCore;
using AOC.Api.Http;
using AOC.Domain.Contracts;
using AOC.Infrastructure.Data;
using AOC.Infrastructure.Media;
using AOC.Infrastructure.Data.Entities;

namespace AOC.Api.Modules.Questions;

public static class ExcelImport
{
    public const int ExcelMaxBytes = 5 * 1024 * 1024;
    public const int MediaMaxBytes = 64 * 1024 * 1024;
    public const int MediaMaxFiles = 100;
    public static readonly int MaxImportRows = QuestionsService.MaxBatchSize * 10;

    private static readonly string[] KnownSheets = ["KHOI_DONG", "GIAI_MA", "BUT_PHA", "VE_DICH"];

    private static readonly Dictionary<string, int> DefaultColumns = new()
    {
        ["id"] = 0, ["question"] = 1, ["answer"] = 2, ["explanation"] = 3, ["note"] = 4, ["media"] = 5
    };

    private static readonly Dictionary<string, string> HeaderTitles = new()
    {
        ["id"] = "id",
        ["question"] = "cau hoi",
        ["answer"] = "dap an",
        ["explanation"] = "giai thich",
        ["note"] = "ghi chu",
        ["media"] = "file anh/video/audio"
    };

    private static readonly HashSet<string> OralBuckets = ["khoi-dong:rieng", "ve-dich:40", "ve-dich:50"];


    private static string CellText(object? cell)
    {
        if (cell is null) return "";
        if (cell is DateTime date)
            return date.ToUniversalTime().ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);
        if (cell is bool b) return b ? "true" : "false";
        return cell.ToString()?.Trim() ?? "";
    }

    private static string Fold(object? value)
    {
        var text = CellText(value).ToLowerInvariant();
        var decomposed = text.Normalize(NormalizationForm.FormD);
        var sb = new StringBuilder(decomposed.Length);
        foreach (var c in decomposed)
            if (CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark)
                sb.Append(c);
        var stripped = sb.ToString().Normalize(NormalizationForm.FormC);
        return Regex.Replace(stripped, @"\s+", " ");
    }

    private static Dictionary<string, int> ColumnsOf(IReadOnlyList<object?>? header)
    {
        var columns = new Dictionary<string, int>(DefaultColumns);
        if (header is null) return columns;
        for (var index = 0; index < header.Count; index++)
        {
            var title = Fold(header[index]);
            foreach (var key in HeaderTitles.Keys)
                if (title == HeaderTitles[key])
                    columns[key] = index;
        }
        return columns;
    }

    private sealed record SheetRows(List<List<object?>> Rows, int FirstRow, Dictionary<string, int> Columns);

    private static SheetRows SplitHeader(List<List<object?>> data)
    {
        var headerIndex = data.FindIndex(row => row.Count > 0 && Fold(row[0]) == "id");
        if (headerIndex == -1)
            return new SheetRows(data, 0, new Dictionary<string, int>(DefaultColumns));

        var columns = ColumnsOf(data[headerIndex]);
        return new SheetRows(data.Skip(headerIndex + 1).ToList(), headerIndex + 1, columns);
    }


    private sealed record Placement(bool Ok, string Bucket, string Kind, bool IsHint, string Problem);

    private static Placement Place(string sheet, string sourceId)
    {
        Placement Mismatch(string expected) => new(false, "", "", false,
            $"\"{sourceId}\" is not a {sheet} ID — expected {expected}");

        switch (sheet)
        {
            case "KHOI_DONG":
                if (Regex.IsMatch(sourceId, @"^KD_C_\d+$"))
                    return new Placement(true, "khoi-dong:chung", "TEXT", false, "");
                if (Regex.IsMatch(sourceId, @"^KD_\d+_\d+$"))
                    return new Placement(true, "khoi-dong:rieng", "TEXT", false, "");
                return Mismatch("KD_<n>_<i> (riêng) or KD_C_<i> (chung)");
            case "GIAI_MA":
                if (sourceId == "GM_KEY")
                    return new Placement(true, "giai-ma", "KEYWORD", false, "");
                if (Regex.IsMatch(sourceId, @"^GM_\d+$"))
                    return new Placement(true, "giai-ma", "TEXT", true, "");
                return Mismatch("GM_KEY or GM_<n>");
            case "BUT_PHA":
                if (Regex.IsMatch(sourceId, @"^BP_\d+$"))
                    return new Placement(true, "but-pha", "TEXT", false, "");
                return Mismatch("BP_<n>");
            case "VE_DICH":
                var cell = Regex.Match(sourceId, @"^VD_(20|30|40|50)_\d+$");
                if (cell.Success)
                    return new Placement(true, $"ve-dich:{cell.Groups[1].Value}", "TEXT", false, "");
                return Mismatch("VD_20|30|40|50_<n>");
            default:
                return new Placement(false, "", "", false, $"sheet \"{sheet}\" has no bucket mapping");
        }
    }


    private sealed record BuiltRow(QuestionsService.CreateQuestionDto Input, string? Warning);

    private static object BuildRow(string kind, string bucket, string question, string answer,
        string explanation, string note)
    {
        var acceptedAnswers = answer
            .Split('\n', StringSplitOptions.RemoveEmptyEntries)
            .Select(line => line.TrimEnd('\r').Trim())
            .Where(line => line.Length > 0)
            .ToList();
        if (acceptedAnswers.Count == 0)
            return new QuestionError(QuestionErrorCode.VALIDATION, $"\"{question}\" has no answer");

        var extra = new Dictionary<string, JsonElement>();
        if (!string.IsNullOrEmpty(explanation)) extra["explanation"] = JsonSerializer.SerializeToElement(explanation);
        if (!string.IsNullOrEmpty(note)) extra["note"] = JsonSerializer.SerializeToElement(note);

        JsonElement payload;
        if (kind == "KEYWORD")
        {
            if (acceptedAnswers.Count > 1)
                return new QuestionError(QuestionErrorCode.VALIDATION,
                    $"the keyword of \"{question}\" must be a single line");
            var dict = new Dictionary<string, JsonElement>
            {
                ["type"] = JsonSerializer.SerializeToElement("KEYWORD"),
                ["code"] = JsonSerializer.SerializeToElement(acceptedAnswers[0])
            };
            foreach (var (k, v) in extra) dict[k] = v;
            payload = JsonSerializer.SerializeToElement(dict, JsonApi.Options);
        }
        else
        {
            var dict = new Dictionary<string, JsonElement>
            {
                ["type"] = JsonSerializer.SerializeToElement(OralBuckets.Contains(bucket) ? "ORAL" : "TEXT"),
                ["acceptedAnswers"] = JsonSerializer.SerializeToElement(acceptedAnswers)
            };
            foreach (var (k, v) in extra) dict[k] = v;
            payload = JsonSerializer.SerializeToElement(dict, JsonApi.Options);
        }

        var input = new QuestionsService.CreateQuestionDto(
            Enum.Parse<QuestionKind>(kind), question, null, payload, null, [bucket]);

        if (OralBuckets.Contains(bucket))
            return new BuiltRow(input,
                $"{bucket} is an ORAL group — stored as ORAL but with no audience choices yet; give it its face in the dialog so the audience sees CHOICE");

        return new BuiltRow(input, null);
    }


    public sealed record MappedRow(
        QuestionsService.CreateQuestionDto? Input,
        bool IsHint,
        QuestionsService.BatchError? Error,
        string? Warning,
        string MediaRef);

    public static MappedRow? MapSourceRow(string sheet, int? excelRow, string sourceId,
        SourceCells cells, int index)
    {
        string locationText;
        if (excelRow is { } rowNumber)
        {
            locationText = $"{sheet} row {rowNumber}";
        }
        else if (sourceId.Length > 0)
        {
            locationText = $"{sheet} ({sourceId})";
        }
        else
        {
            locationText = $"{sheet} (no ID)";
        }
        var location = new List<string> { locationText };

        var question = cells.Question;
        var answer = cells.Answer;

        if (question.Length == 0 && answer.Length == 0) return null;

        MappedRow Refused(string message, List<string>? details = null) =>
            new(null, false,
                new QuestionsService.BatchError(index, "VALIDATION", message, details ?? location),
                null, "");

        if (sourceId.Length == 0)
            return Refused("this row has a question but no ID",
                [.. location, "the ID names the group: KD_…, GM_…, BP_…, VD_…"]);
        if (question.Length == 0)
            return Refused($"\"{sourceId}\" has no question text");
        if (answer.Length == 0)
            return Refused($"\"{sourceId}\" has no answer");

        var placed = Place(sheet, sourceId);
        if (!placed.Ok)
            return Refused(placed.Problem);

        var built = BuildRow(placed.Kind, placed.Bucket, question, answer, cells.Explanation, cells.Note);
        if (built is QuestionError error)
            return Refused($"\"{sourceId}\": {error.Message}", location);

        var builtRow = (BuiltRow)built;
        return new MappedRow(builtRow.Input, placed.IsHint, null, builtRow.Warning, cells.Media);
    }



    public sealed record ParsedWorkbook(
        List<ParsedEntry> Entries,
        int Skipped,
        List<string> SheetNames);

    public sealed record RowSummary(int Index, string Sheet, string SourceId, string Bucket, string Kind);

    public static ParsedWorkbook ParseWorkbook(byte[] buffer)
    {
        XLWorkbook workbook;
        try
        {
            workbook = new XLWorkbook(new MemoryStream(buffer));
        }
        catch (Exception ex)
        {
            throw new QuestionError(QuestionErrorCode.VALIDATION, "that file could not be read as .xlsx",
                [ex.Message]);
        }

        using var _ = workbook;
        var entries = new List<ParsedEntry>();
        var skipped = 0;

        foreach (var sheet in workbook.Worksheets)
        {
            var name = sheet.Name.Trim().ToUpperInvariant();

            var data = new List<List<object?>>();
            var range = sheet.RangeUsed();
            if (range is not null)
            {
                var rowCount = range.RowCount();
                var colCount = range.ColumnCount();
                for (var r = 1; r <= rowCount; r++)
                {
                    var row = new List<object?>();
                    for (var c = 1; c <= colCount; c++)
                    {
                        var cell = sheet.Cell(r, c);
                        if (cell.IsEmpty())
                            row.Add(null);
                        else if (cell.DataType == XLDataType.DateTime)
                            row.Add(cell.GetDateTime());
                        else
                            row.Add(cell.Value);
                    }
                    data.Add(row);
                }
            }

            var (rows, firstRow, columns) = SplitHeader(data);

            if (!KnownSheets.Contains(name))
            {
                var filled = rows.Any(row => row.Any(cell => CellText(cell).Length > 0));
                if (filled)
                    throw new QuestionError(QuestionErrorCode.VALIDATION, $"unknown sheet \"{sheet.Name}\"",
                        [$"expected one of: {string.Join(", ", KnownSheets)}"]);
                continue;
            }

            for (var offset = 0; offset < rows.Count; offset++)
            {
                var row = rows[offset];
                var excelRow = firstRow + offset + 1;
                var index = entries.Count;
                object? At(string key)
                {
                    var column = columns[key];
                    return column < row.Count ? row[column] : null;
                }

                var sourceId = CellText(At("id"));
                var cells = new SourceCells
                {
                    Question = CellText(At("question")),
                    Answer = CellText(At("answer")),
                    Explanation = CellText(At("explanation")),
                    Note = CellText(At("note")),
                    Media = CellText(At("media"))
                };

                var mapped = MapSourceRow(name, excelRow, sourceId, cells, index);
                if (mapped is null)
                {
                    skipped += 1;
                    continue;
                }

                entries.Add(new ParsedEntry(
                    mapped,
                    new RowSummary(index, name, sourceId,
                        mapped.Input?.Tags?.FirstOrDefault() ?? "-",
                        mapped.Input?.Kind.ToString() ?? "-"),
                    cells));
            }
        }

        return new ParsedWorkbook(entries, skipped,
            workbook.Worksheets.Select(s => s.Name).ToList());
    }


    public static List<QuestionsService.BatchError> StructuralProblems(
        IReadOnlyList<(int Index, string Kind, bool IsHint)> rows)
    {
        var keywords = rows.Where(r => r.Kind == "KEYWORD").ToList();
        var hints = rows.Where(r => r.IsHint).ToList();
        var problems = new List<QuestionsService.BatchError>();

        if (hints.Count > 0 && keywords.Count == 0)
            foreach (var hint in hints)
                problems.Add(new QuestionsService.BatchError(hint.Index, "VALIDATION",
                    "hint rows need their GM_KEY row",
                    ["GM_1…GM_8 hang from the keyword that GM_KEY defines — fill GM_KEY first"]));

        if (keywords.Count > 1)
            foreach (var duplicate in keywords.Skip(1))
                problems.Add(new QuestionsService.BatchError(duplicate.Index, "VALIDATION",
                    "the file defines GM_KEY more than once",
                    [$"{keywords.Count} GM_KEY rows — one Giải mã set has exactly one keyword"]));

        foreach (var hint in hints.Skip(8))
        {
            var offset = hints.IndexOf(hint) - 8;
            problems.Add(new QuestionsService.BatchError(hint.Index, "VALIDATION",
                "a Giải mã set holds at most 8 hints",
                [$"this file has {hints.Count} hint rows; this one is number {offset + 9}"]));
        }

        return problems;
    }


    internal static List<QuestionsService.BatchError> AttachMedia(
        ParsedWorkbook parsed, IReadOnlyList<MediaAttachment> attachments)
    {
        var errors = new List<QuestionsService.BatchError>();
        for (var index = 0; index < parsed.Entries.Count; index++)
        {
            var entry = parsed.Entries[index];
            if (entry.Mapped.MediaRef.Length == 0 || entry.Mapped.Input is null) continue;

            var file = MediaStorage.FindAttachment(attachments, entry.Mapped.MediaRef);
            if (file is null)
            {
                AppendWarning(entry,
                    $"media \"{entry.Mapped.MediaRef}\" was not in the upload — not stored; bundle it with the workbook or set it in the dialog");
                continue;
            }
            if (!MediaStorage.MediaStorageConfigured())
            {
                errors.Add(new QuestionsService.BatchError(index, "MEDIA",
                    $"media \"{entry.Mapped.MediaRef}\" arrived but cannot be stored — media storage is not configured (S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY)",
                    []));
                continue;
            }
            if (MediaStorage.KindFor(file.Filename, file.ContentType) is null)
            {
                AppendWarning(entry, $"media \"{entry.Mapped.MediaRef}\" names no media type — not stored");
                continue;
            }

            entry.Attachment = file;
        }
        return errors;
    }

    private static void AppendWarning(ParsedEntry entry, string message)
    {
        entry.Mapped = entry.Mapped with
        {
            Warning = entry.Mapped.Warning is null ? message : $"{entry.Mapped.Warning} · {message}"
        };
    }

    private static string Reason(Exception error)
    {
        if (!string.IsNullOrWhiteSpace(error.Message)) return error.Message;
        if (error is Amazon.S3.AmazonS3Exception s3 && !string.IsNullOrEmpty(s3.ErrorCode))
            return $"{s3.ErrorCode} (HTTP {(int)s3.StatusCode})";
        return error.GetType().Name;
    }

    internal static async Task<List<QuestionsService.BatchError>> UploadMediaAsync(
        ParsedWorkbook parsed, ILogger logger)
    {
        var uploads = new Dictionary<string, StoredMedia>();
        var errors = new List<QuestionsService.BatchError>();

        for (var index = 0; index < parsed.Entries.Count; index++)
        {
            var entry = parsed.Entries[index];
            var file = entry.Attachment;
            if (file is null || entry.Mapped.Input is null) continue;
            if (entry.Mapped.Input.Media is not null) continue;

            if (!uploads.TryGetValue(file.Filename, out var stored))
            {
                try
                {
                    stored = await MediaStorage.StoreMediaAsync(file);
                    uploads[file.Filename] = stored;
                }
                catch (Exception error)
                {
                    logger.LogError(error, "media upload failed for {MediaRef} ({Filename})",
                        entry.Mapped.MediaRef, file.Filename);
                    errors.Add(new QuestionsService.BatchError(index, "MEDIA",
                        $"media \"{entry.Mapped.MediaRef}\": {Reason(error)}", []));
                    continue;
                }
            }

            var input = entry.Mapped.Input;
            entry.Mapped = entry.Mapped with
            {
                Input = input with
                {
                    Media = new Media(stored.Url,
                        Enum.Parse<AOC.Domain.Contracts.MediaKind>(stored.Type.ToString()))
                }
            };
        }

        return errors;
    }


    internal static List<QuestionsService.BatchError> DuplicatesInFile(ParsedWorkbook parsed)
    {
        var seen = new Dictionary<string, int>();
        var duplicates = new List<QuestionsService.BatchError>();

        for (var index = 0; index < parsed.Entries.Count; index++)
        {
            var entry = parsed.Entries[index];
            if (entry.Mapped.Input is null) continue;
            var print = QuestionsService.Fingerprint(
                entry.Mapped.Input.Kind.ToString(),
                entry.Mapped.Input.QuestionText,
                entry.Mapped.Input.Payload,
                entry.Mapped.Input.Tags);
            if (seen.TryGetValue(print, out var first))
            {
                duplicates.Add(new QuestionsService.BatchError(index, "DUPLICATE",
                    $"identical to row {first + 1} of this file", []));
                continue;
            }
            seen[print] = index;
        }
        return duplicates;
    }
}
