using System.IO.Compression;
using System.Text.Json;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using AOC.Api.Http;
using AOC.Api.Modules.Questions.Reads;
using AOC.Api.Modules.Tournaments;
using AOC.Api.Shared;
using AOC.Domain.Contracts;
using AOC.Infrastructure.Media;
using AOC.Infrastructure.Configuration;
using AOC.Infrastructure.Data;
using AOC.Infrastructure.Data.Entities;

namespace AOC.Api.Modules.Questions;

public static partial class QuestionRoutes
{
    public static IEndpointRouteBuilder MapQuestionStagingRoutes(this IEndpointRouteBuilder app)
    {
        app.MapPost("/portal/questions/media", async (HttpContext http) =>
        {
            await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
            SetBodyLimit(http, ExcelImport.MediaMaxBytes);

            if (!http.Request.HasFormContentType)
                throw new QuestionError(QuestionErrorCode.VALIDATION, "the upload must be a multipart file");

            var form = await http.Request.ReadFormAsync();
            var file = form.Files.FirstOrDefault(f => f.FileName.Length > 0)
                ?? throw new QuestionError(QuestionErrorCode.VALIDATION, "the upload carries no file");

            byte[] content;
            await using (var ms = new MemoryStream())
            {
                await file.CopyToAsync(ms);
                content = ms.ToArray();
            }

            var attachment = new MediaAttachment(file.FileName, file.ContentType, content);
            if (MediaStorage.KindFor(attachment.Filename, attachment.ContentType) is null)
                throw new QuestionError(QuestionErrorCode.VALIDATION,
                    $"\"{attachment.Filename}\" names no media type",
                    ["expected an image, audio or video file"]);
            if (!MediaStorage.MediaStorageConfigured())
                throw new QuestionError(QuestionErrorCode.VALIDATION,
                    "media storage is not configured (S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY)");

            var stored = await MediaStorage.StoreMediaAsync(attachment);
            return Results.Json(new { url = stored.Url, type = stored.Type.ToString() }, JsonApi.Options);
        });

        app.MapPost("/portal/questions/import-excel", async (HttpContext http) =>
        {
            var user = await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
            SetBodyLimit(http, ExcelImport.MediaMaxBytes);

            var dryRunRaw = Validate.Query(http).GetValueOrDefault("dryRun");
            var dryRun = dryRunRaw is "true" or "1";
            var stageRaw = Validate.Query(http).GetValueOrDefault("stage");
            var stage = stageRaw is "true" or "1";

            var (workbook, sourceName, attachments) = await ReadBundleAsync(http);

            if (workbook.Length == 0)
                throw new QuestionError(QuestionErrorCode.VALIDATION, "the upload must carry the .xlsx file itself");
            if (workbook.Length > ExcelImport.ExcelMaxBytes)
                throw new QuestionError(QuestionErrorCode.VALIDATION, "the workbook may be at most 5 MB",
                    [$"{workbook.Length / (1024.0 * 1024):0.0} MB"]);

            var db = http.RequestServices.GetRequiredService<AOCDbContext>();
            var service = http.RequestServices.GetRequiredService<QuestionsService>();
            var logger = http.RequestServices.GetRequiredService<ILoggerFactory>()
                .CreateLogger("AOC.Api.Questions.ExcelImport");
            var report = await ExcelImport.ImportExcelAsync(
                new QuestionsService.WriteContext(user.Id),
                workbook, dryRun, attachments, sourceName, service, db, logger, forceStage: stage);

            if (!report.DryRun && report.Errors.Count > 0 && report.StagedBatchId is null)
                http.Response.StatusCode = 400;
            return Results.Json(report, JsonApi.Options);
        });

        app.MapGet("/portal/question-imports", async (HttpContext http) =>
        {
            await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
            var service = http.RequestServices.GetRequiredService<StagingService>();
            var active = await service.ActiveBatchAsync();
            var batches = await service.ListBatchesAsync();
            return Results.Json(new { active, batches }, JsonApi.Options);
        });

        app.MapGet("/portal/question-imports/{batchId}/rows", async (HttpContext http) =>
        {
            await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
            var batchId = Validate.RouteUuid(http, "batchId");
            var service = http.RequestServices.GetRequiredService<StagingService>();
            var items = await service.ListRowsAsync(batchId);
            return Results.Json(new { items }, JsonApi.Options);
        });

        app.MapPatch("/portal/question-imports/{batchId}/rows/{rowId}", async (HttpContext http) =>
        {
            await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
            var batchId = Validate.RouteUuid(http, "batchId");
            var rowId = Validate.RouteUuid(http, "rowId");
            var body = Validate.Object(await Validate.ReadJsonBodyAsync(http));

            StagingService.RowPatch patch = new(null, null);
            if (body.TryGetProperty("cells", out var cellsEl) && cellsEl.ValueKind == JsonValueKind.Object)
            {
                var dict = new Dictionary<string, string>();
                foreach (var prop in cellsEl.EnumerateObject())
                {
                    if (prop.Value.ValueKind != JsonValueKind.String)
                        throw ApiException.BadRequest("/cells: Expected string");
                    dict[prop.Name] = prop.Value.GetString()!;
                }
                patch = patch with { Cells = dict };
            }
            if (body.TryGetProperty("dropped", out var droppedEl))
            {
                if (droppedEl.ValueKind is not (JsonValueKind.True or JsonValueKind.False))
                    throw ApiException.BadRequest("/dropped: Expected boolean");
                patch = patch with { Dropped = droppedEl.GetBoolean() };
            }

            var service = http.RequestServices.GetRequiredService<StagingService>();
            return Results.Json(await service.UpdateRowAsync(batchId, rowId, patch), JsonApi.Options);
        });

        app.MapPost("/portal/question-imports/{batchId}/rows", async (HttpContext http) =>
        {
            await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
            var batchId = Validate.RouteUuid(http, "batchId");
            var body = Validate.Object(await Validate.ReadJsonBodyAsync(http));
            var sheet = Validate.RequiredString(body, "sheet");
            if (sheet is not ("KHOI_DONG" or "GIAI_MA" or "BUT_PHA" or "VE_DICH"))
                throw ApiException.BadRequest("/sheet: Expected enum value");
            var sourceId = Validate.RequiredString(body, "sourceId", minLength: 1, maxLength: 64);

            if (!body.TryGetProperty("cells", out var cellsEl) || cellsEl.ValueKind != JsonValueKind.Object)
                throw ApiException.BadRequest("body must have required property 'cells'");
            var cells = new SourceCells
            {
                Question = StrProp(cellsEl, "question"),
                Answer = StrProp(cellsEl, "answer"),
                Explanation = StrProp(cellsEl, "explanation"),
                Note = StrProp(cellsEl, "note"),
                Media = StrProp(cellsEl, "media")
            };

            var service = http.RequestServices.GetRequiredService<StagingService>();
            var row = await service.AddRowAsync(batchId, sheet, sourceId, cells);
            http.Response.StatusCode = 201;
            return Results.Json(row, JsonApi.Options);
        });

        app.MapPost("/portal/question-imports/{batchId}/commit", async (HttpContext http) =>
        {
            var user = await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
            var batchId = Validate.RouteUuid(http, "batchId");
            var service = http.RequestServices.GetRequiredService<StagingService>();
            var result = await service.CommitBatchAsync(new QuestionsService.WriteContext(user.Id), batchId);
            return Results.Json(result, JsonApi.Options);
        });

        app.MapDelete("/portal/question-imports/{batchId}", async (HttpContext http) =>
        {
            await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
            var batchId = Validate.RouteUuid(http, "batchId");
            var service = http.RequestServices.GetRequiredService<StagingService>();
            await service.DiscardBatchAsync(batchId);
            http.Response.StatusCode = 204;
            return Results.Empty;
        });

        app.MapPost("/portal/question-imports/{batchId}/commit-to-match", async (HttpContext http) =>
        {
            var user = await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
            var batchId = Validate.RouteUuid(http, "batchId");
            var body = Validate.Object(await Validate.ReadJsonBodyAsync(http));
            var tournamentId = Validate.RequiredUuid(body, "tournamentId");
            var matchId = Validate.RequiredUuid(body, "matchId");

            var service = http.RequestServices.GetRequiredService<StagingService>();
            var result = await service.CommitBatchToMatchAsync(
                new QuestionsService.WriteContext(user.Id), batchId, tournamentId, matchId);

            if (result.Errors.Count == 0)
            {
                var audit = http.RequestServices.GetRequiredService<AOC.Infrastructure.Audit.AuditService>();
                await audit.AuditAsync(new AOC.Infrastructure.Audit.AuditEvent
                {
                    Action = "question_published",
                    ActorId = user.Id,
                    Ip = http.Connection.RemoteIpAddress?.ToString(),
                    UserAgent = http.Request.Headers.UserAgent.ToString(),
                    Details = new Dictionary<string, object?>
                    {
                        ["batchId"] = batchId,
                        ["matchId"] = matchId,
                        ["count"] = result.Created
                    }
                });
            }
            return Results.Json(result, JsonApi.Options);
        });

        return app;
    }

    private static readonly string[] XlsxContentTypes =
    [
        "application/octet-stream",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    ];

    private static void SetBodyLimit(HttpContext http, long bytes)
    {
        var feature = http.Features.Get<IHttpMaxRequestBodySizeFeature>();
        if (feature is { IsReadOnly: false }) feature.MaxRequestBodySize = bytes;
    }

    private sealed record ExcelUpload(byte[] Workbook, string? SourceName, List<MediaAttachment> Attachments);

    private static bool IsJunkEntry(string name)
    {
        if (name.Contains("__MACOSX/")) return true;
        var baseName = MediaStorage.Basename(name);
        if (baseName.Length == 0 || baseName == ".DS_Store") return true;
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
                if (++counted > ExcelImport.MediaMaxFiles + 1)
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

    private static async Task<ExcelUpload> ReadBundleAsync(HttpContext http)
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
}
