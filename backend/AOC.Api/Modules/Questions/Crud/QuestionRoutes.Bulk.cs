using System.Text.Json;
using AOC.Api.Http;
using AOC.Api.Shared;
using AOC.Domain.Contracts;
using AOC.Infrastructure.Configuration;
using AOC.Infrastructure.Data;

namespace AOC.Api.Modules.Questions;

public static partial class QuestionRoutes
{
    private static void MapBulkRoutes(IEndpointRouteBuilder app)
    {
        app.MapPost("/portal/questions/bulk", async (HttpContext http) =>
        {
            var user = await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
            var body = Validate.Object(await Validate.ReadJsonBodyAsync(http));
            var action = Validate.RequiredString(body, "action");
            var ids = Validate.RequiredArray(body, "ids", minItems: 1, maxItems: QuestionsService.MaxBatchSize)
                .Select(element => ParseUuid(
                    element.ValueKind == JsonValueKind.String
                        ? element.GetString()!
                        : throw ApiException.BadRequest("ids: Expected an array of uuid strings"),
                    "ids"))
                .ToList();

            QuestionStatus? status = null;
            if (body.TryGetProperty("status", out var statusEl) && statusEl.ValueKind != JsonValueKind.Null)
            {
                if (statusEl.ValueKind != JsonValueKind.String)
                    throw ApiException.BadRequest("/status: Expected union value");
                status = ParseStatus(statusEl.GetString())
                    ?? throw ApiException.BadRequest("/status: Expected union value");
            }

            var bucket = Validate.OptionalString(body, "bucket");

            var service = http.RequestServices.GetRequiredService<QuestionsService>();
            var report = await service.BulkQuestionsAsync(
                new QuestionsService.WriteContext(user.Id), action, ids, status, bucket, user.Role);

            await AuditBulkAsync(http, report, status, bucket);

            if (report.Errors.Count > 0) http.Response.StatusCode = 400;
            return Results.Json(report, JsonApi.Options);
        });
    }
}
