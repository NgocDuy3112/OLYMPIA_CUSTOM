using Microsoft.AspNetCore.Http.Features;
using AOC.Api.Http;
using AOC.Infrastructure.Configuration;
using AOC.Infrastructure.Media;

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

        app.MapPost("/portal/tournaments/{tournamentId}/matches/{matchId}/questions/import",
            async (HttpContext http) =>
        {
            var user = await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
            SetBodyLimit(http, ExcelImport.MediaMaxBytes);
            var tournamentId = Validate.RouteUuid(http, "tournamentId");
            var matchId = Validate.RouteUuid(http, "matchId");

            var bundle = await MatchDirectImportService.ReadBundleAsync(http);

            if (bundle.Workbook.Length == 0)
                throw new QuestionError(QuestionErrorCode.VALIDATION, "the upload must carry the .xlsx file itself");
            if (bundle.Workbook.Length > ExcelImport.ExcelMaxBytes)
                throw new QuestionError(QuestionErrorCode.VALIDATION, "the workbook may be at most 5 MB",
                    [$"{bundle.Workbook.Length / (1024.0 * 1024):0.0} MB"]);

            var service = http.RequestServices.GetRequiredService<MatchDirectImportService>();
            var result = await service.ImportToMatchAsync(
                new QuestionsService.WriteContext(user.Id), tournamentId, matchId,
                bundle.Workbook, bundle.Attachments);
            return Results.Json(result, JsonApi.Options);
        });

        return app;
    }

    private static void SetBodyLimit(HttpContext http, long bytes)
    {
        var feature = http.Features.Get<IHttpMaxRequestBodySizeFeature>();
        if (feature is { IsReadOnly: false }) feature.MaxRequestBodySize = bytes;
    }
}
