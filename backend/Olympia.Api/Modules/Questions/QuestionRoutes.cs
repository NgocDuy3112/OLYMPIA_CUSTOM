using System.IO.Compression;
using System.Text.Json;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Olympia.Api.Http;
using Olympia.Api.Modules.Tournaments;
using Olympia.Api.Shared;
using Olympia.Domain.Contracts;
using Olympia.Infrastructure.Media;
using Olympia.Infrastructure.Configuration;
using Olympia.Infrastructure.Data;
using Olympia.Infrastructure.Data.Entities;

namespace Olympia.Api.Modules.Questions;

/// <summary>Port of questions/routes.ts.</summary>
public static class QuestionRoutes
{
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

    public static IEndpointRouteBuilder MapQuestionRoutes(this IEndpointRouteBuilder app)
    {
        // POST /portal/questions
        app.MapPost("/portal/questions", async (HttpContext http) =>
        {
            var user = await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
            var body = await Validate.ReadJsonBodyAsync(http);
            var service = http.RequestServices.GetRequiredService<QuestionsService>();
            var input = QuestionsService.ParseCreate(body);
            var row = await service.CreateQuestionAsync(new QuestionsService.WriteContext(user.Id), input);
            http.Response.StatusCode = 201;
            return Results.Json(row, JsonApi.Options);
        });

        // POST /portal/questions/batch
        app.MapPost("/portal/questions/batch", async (HttpContext http) =>
        {
            var user = await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
            var body = Validate.Object(await Validate.ReadJsonBodyAsync(http));
            var dryRun = Validate.OptionalBool(body, "dryRun") ?? false;
            var questions = Validate.RequiredArray(body, "questions", minItems: 1, maxItems: QuestionsService.MaxBatchSize);

            var service = http.RequestServices.GetRequiredService<QuestionsService>();
            var report = await service.ImportQuestionsAsync(
                new QuestionsService.WriteContext(user.Id),
                questions.Select(q => q.Clone()).ToList(),
                dryRun);

            if (!dryRun && report.Errors.Count > 0) http.Response.StatusCode = 400;
            return Results.Json(report, JsonApi.Options);
        });

        // POST /portal/questions/media — one-off upload to S3
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

        // POST /portal/questions/import-excel
        app.MapPost("/portal/questions/import-excel", async (HttpContext http) =>
        {
            var user = await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
            SetBodyLimit(http, ExcelImport.MediaMaxBytes);

            var dryRunRaw = Validate.Query(http).GetValueOrDefault("dryRun");
            var dryRun = dryRunRaw is "true" or "1";

            var (workbook, sourceName, attachments) = await ReadBundleAsync(http);

            if (workbook.Length == 0)
                throw new QuestionError(QuestionErrorCode.VALIDATION, "the upload must carry the .xlsx file itself");
            if (workbook.Length > ExcelImport.ExcelMaxBytes)
                throw new QuestionError(QuestionErrorCode.VALIDATION, "the workbook may be at most 5 MB",
                    [$"{workbook.Length / (1024.0 * 1024):0.0} MB"]);

            var db = http.RequestServices.GetRequiredService<OlympiaDbContext>();
            var service = http.RequestServices.GetRequiredService<QuestionsService>();
            var logger = http.RequestServices.GetRequiredService<ILoggerFactory>()
                .CreateLogger("Olympia.Api.Questions.ExcelImport");
            var report = await ExcelImport.ImportExcelAsync(
                new QuestionsService.WriteContext(user.Id),
                workbook, dryRun, attachments, sourceName, service, db, logger);

            if (!report.DryRun && report.Errors.Count > 0 && report.StagedBatchId is null)
                http.Response.StatusCode = 400;
            return Results.Json(report, JsonApi.Options);
        });

        // GET /portal/question-imports
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
            var user = await http.RequireRoleAsync(Surface.PORTAL, "ADMIN");
            var batchId = Validate.RouteUuid(http, "batchId");
            var body = Validate.Object(await Validate.ReadJsonBodyAsync(http));
            var tournamentId = Validate.RequiredUuid(body, "tournamentId");
            var matchId = Validate.RequiredUuid(body, "matchId");

            var service = http.RequestServices.GetRequiredService<StagingService>();
            var result = await service.CommitBatchToMatchAsync(
                new QuestionsService.WriteContext(user.Id), batchId, tournamentId, matchId);

            if (result.Errors.Count == 0)
            {
                var audit = http.RequestServices.GetRequiredService<Olympia.Infrastructure.Audit.AuditService>();
                await audit.AuditAsync(new Olympia.Infrastructure.Audit.AuditEvent
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

        // GET /portal/questions
        app.MapGet("/portal/questions", async (HttpContext http) =>
        {
            await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
            var query = Validate.Query(http);

            var filters = new QuestionsService.ListFilters(
                Status: ParseStatus(query.GetValueOrDefault("status")),
                Kind: ParseKind(query.GetValueOrDefault("kind")),
                KeywordId: query.GetValueOrDefault("keywordId") is { } kw && kw.Length > 0
                    ? Guid.Parse(kw) : null,
                Search: query.GetValueOrDefault("search"),
                Ids: query.GetValueOrDefault("ids")?.Split(',')
                    .Select(id => id.Trim())
                    .Where(id => id.Length > 0)
                    .Select(Guid.Parse)
                    .ToList(),
                Cursor: query.GetValueOrDefault("cursor"),
                Bucket: query.GetValueOrDefault("bucket"));

            var service = http.RequestServices.GetRequiredService<QuestionsService>();
            var page = Pagination.ParsePage(query, 500);
            return Results.Json(await service.ListQuestionsAsync(filters, page), JsonApi.Options);
        });

        // GET /portal/questions/bucket-counts
        app.MapGet("/portal/questions/bucket-counts", async (HttpContext http) =>
        {
            await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
            var query = Validate.Query(http);
            var service = http.RequestServices.GetRequiredService<QuestionsService>();
            var counts = await service.BucketCountsAsync(
                ParseStatus(query.GetValueOrDefault("status")), query.GetValueOrDefault("search"));
            return Results.Json(counts, JsonApi.Options);
        });

        // GET /portal/tournaments/:tournamentId/eligible-questions
        app.MapGet("/portal/tournaments/{tournamentId}/eligible-questions", async (HttpContext http) =>
        {
            var user = await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
            var tournamentId = Validate.RouteUuid(http, "tournamentId");

            var tournaments = http.RequestServices.GetRequiredService<TournamentsService>();
            TournamentEntity tournament;
            try
            {
                tournament = await tournaments.RequireTournamentAsync(tournamentId);
            }
            catch (TournamentError)
            {
                throw new QuestionError(QuestionErrorCode.NOT_FOUND, $"tournament {tournamentId} not found");
            }
            if (!TournamentAccess.CanView(tournament, user))
                throw new QuestionError(QuestionErrorCode.NOT_FOUND, $"tournament {tournamentId} not found");

            var query = Validate.Query(http);
            var kindsRaw = query.GetValueOrDefault("kinds");
            var kinds = kindsRaw?.Split(',').Select(k => ParseKind(k)).Where(k => k is not null)
                .Select(k => k!.Value).ToList();

            var service = http.RequestServices.GetRequiredService<QuestionsService>();
            var page = Pagination.ParsePage(query, 500);
            var items = await service.ListForAssemblyAsync(
                kinds, query.GetValueOrDefault("bucket"), query.GetValueOrDefault("search"), page);
            return Results.Json(items, JsonApi.Options);
        });

        // GET /portal/questions/:questionId
        app.MapGet("/portal/questions/{questionId}", async (HttpContext http) =>
        {
            await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
            var questionId = Validate.RouteUuid(http, "questionId");
            var service = http.RequestServices.GetRequiredService<QuestionsService>();
            return Results.Json(await service.RequireQuestionAsync(questionId), JsonApi.Options);
        });

        // PATCH /portal/questions/:questionId
        app.MapPatch("/portal/questions/{questionId}", async (HttpContext http) =>
        {
            await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
            var questionId = Validate.RouteUuid(http, "questionId");
            var body = await Validate.ReadJsonBodyAsync(http);
            var service = http.RequestServices.GetRequiredService<QuestionsService>();
            await service.RequireQuestionAsync(questionId);
            return Results.Json(await service.UpdateQuestionAsync(questionId, body), JsonApi.Options);
        });

        // PATCH /portal/questions/:questionId/status
        app.MapPatch("/portal/questions/{questionId}/status", async (HttpContext http) =>
        {
            var user = await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
            var questionId = Validate.RouteUuid(http, "questionId");
            var body = Validate.Object(await Validate.ReadJsonBodyAsync(http));
            var statusRaw = Validate.RequiredString(body, "status");
            if (!Enum.TryParse<QuestionStatus>(statusRaw, out var status))
                throw ApiException.BadRequest("/status: Expected union value");

            var service = http.RequestServices.GetRequiredService<QuestionsService>();
            await service.RequireQuestionAsync(questionId);
            var question = await service.TransitionQuestionAsync(questionId, status, user.Role);
            await AuditGateAsync(http, question);
            return Results.Json(question, JsonApi.Options);
        });

        // POST /portal/questions/:questionId/duplicate
        app.MapPost("/portal/questions/{questionId}/duplicate", async (HttpContext http) =>
        {
            var user = await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
            var questionId = Validate.RouteUuid(http, "questionId");
            var service = http.RequestServices.GetRequiredService<QuestionsService>();
            var row = await service.DuplicateQuestionAsync(new QuestionsService.WriteContext(user.Id), questionId);
            http.Response.StatusCode = 201;
            return Results.Json(row, JsonApi.Options);
        });

        // GET /portal/questions/:questionId/usage
        app.MapGet("/portal/questions/{questionId}/usage", async (HttpContext http) =>
        {
            await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
            var questionId = Validate.RouteUuid(http, "questionId");
            var service = http.RequestServices.GetRequiredService<QuestionsService>();
            await service.RequireQuestionAsync(questionId);
            var items = await service.QuestionUsageAsync(questionId);
            return Results.Json(new { items }, JsonApi.Options);
        });

        // DELETE /portal/questions/:questionId → archive
        app.MapDelete("/portal/questions/{questionId}", async (HttpContext http) =>
        {
            var user = await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
            var questionId = Validate.RouteUuid(http, "questionId");
            var service = http.RequestServices.GetRequiredService<QuestionsService>();
            await service.RequireQuestionAsync(questionId);
            var archived = await service.TransitionQuestionAsync(questionId, QuestionStatus.ARCHIVED, user.Role);
            await AuditGateAsync(http, archived);
            http.Response.StatusCode = 204;
            return Results.Empty;
        });

        return app;
    }

    private static string StrProp(JsonElement obj, string name)
        => obj.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString()! : "";

    private static QuestionStatus? ParseStatus(string? raw)
    {
        if (raw is null) return null;
        if (!Enum.TryParse<QuestionStatus>(raw, out var parsed))
            throw ApiException.BadRequest("status: Expected union value");
        return parsed;
    }

    private static QuestionKind? ParseKind(string? raw)
    {
        if (raw is null) return null;
        if (!Enum.TryParse<QuestionKind>(raw, out var parsed))
            throw ApiException.BadRequest("kind: Expected union value");
        return parsed;
    }

    private static readonly Dictionary<string, string> GateActions = new()
    {
        ["PENDING"] = "question_submitted",
        ["PUBLISHED"] = "question_published",
        ["ARCHIVED"] = "question_archived"
    };

    private static Task AuditGateAsync(HttpContext http, QuestionBankEntity question)
    {
        if (!GateActions.TryGetValue(question.Status.ToString(), out var action))
            return Task.CompletedTask;

        var user = http.Items.TryGetValue(Guards.SessionUserKey, out var u)
            ? u as Infrastructure.Data.Entities.UserEntity
            : null;
        var audit = http.RequestServices.GetRequiredService<Olympia.Infrastructure.Audit.AuditService>();
        return audit.AuditAsync(new Olympia.Infrastructure.Audit.AuditEvent
        {
            Action = action,
            ActorId = user?.Id,
            Ip = http.Connection.RemoteIpAddress?.ToString(),
            UserAgent = http.Request.Headers.UserAgent.ToString(),
            Details = new Dictionary<string, object?>
            {
                ["questionId"] = question.Id,
                ["kind"] = question.Kind.ToString()
            }
        });
    }

    // ---- upload bundles ---------------------------------------------------------------

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
            // Raw body is always the workbook.
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
                // Kept for scripts and older clients that still send "media" parts.
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
