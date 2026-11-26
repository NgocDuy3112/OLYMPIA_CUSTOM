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
    public static IEndpointRouteBuilder MapQuestionRoutes(this IEndpointRouteBuilder app)
    {
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

        app.MapPost("/portal/questions/bulk", async (HttpContext http) =>
        {
            var user = await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
            var body = Validate.Object(await Validate.ReadJsonBodyAsync(http));
            var action = Validate.RequiredString(body, "action");
            var ids = Validate.RequiredArray(body, "ids", minItems: 1, maxItems: QuestionsService.MaxBatchSize)
                .Select(element => ParseUuid(element.GetString() ?? "", "ids"))
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

        app.MapGet("/portal/questions", async (HttpContext http) =>
        {
            await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
            var query = Validate.Query(http);

            var filters = new QuestionFilter(
                Status: ParseStatus(query.GetValueOrDefault("status")),
                Kind: ParseKind(query.GetValueOrDefault("kind")),
                KeywordId: query.GetValueOrDefault("keywordId") is { Length: > 0 } kw
                    ? ParseUuid(kw, "keywordId") : null,
                Search: query.GetValueOrDefault("search"),
                Ids: query.GetValueOrDefault("ids")?.Split(',')
                    .Select(id => id.Trim())
                    .Where(id => id.Length > 0)
                    .Select(id => ParseUuid(id, "ids"))
                    .ToList(),
                Bucket: query.GetValueOrDefault("bucket"));

            var service = http.RequestServices.GetRequiredService<IQuestionReads>();
            var page = Pagination.ParsePage(query);
            return Results.Json(await service.ListAsync(filters, page), JsonApi.Options);
        });

        app.MapGet("/portal/questions/bucket-counts", async (HttpContext http) =>
        {
            await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
            var query = Validate.Query(http);
            var service = http.RequestServices.GetRequiredService<IQuestionReads>();
            var counts = await service.BucketCountsAsync(
                ParseStatus(query.GetValueOrDefault("status")), query.GetValueOrDefault("search"));
            return Results.Json(counts, JsonApi.Options);
        });

        app.MapGet("/portal/tournaments/{tournamentId}/eligible-questions", async (HttpContext http) =>
        {
            await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
            var tournamentId = Validate.RouteUuid(http, "tournamentId");

            await TournamentAccess.RequireViewAsync(http, tournamentId);

            var query = Validate.Query(http);
            var kindsRaw = query.GetValueOrDefault("kinds");
            var kinds = kindsRaw?.Split(',').Select(k => ParseKind(k)).Where(k => k is not null)
                .Select(k => k!.Value).ToList();

            var service = http.RequestServices.GetRequiredService<QuestionReadStore>();
            var page = Pagination.ParsePage(query, 500);
            var items = await service.ListForAssemblyAsync(
                kinds, query.GetValueOrDefault("bucket"), query.GetValueOrDefault("search"), page);
            return Results.Json(items, JsonApi.Options);
        });

        app.MapPatch("/portal/questions/{questionId}", async (HttpContext http) =>
        {
            await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
            var questionId = Validate.RouteUuid(http, "questionId");
            var body = await Validate.ReadJsonBodyAsync(http);
            var service = http.RequestServices.GetRequiredService<QuestionsService>();
            await service.RequireQuestionAsync(questionId);
            return Results.Json(await service.UpdateQuestionAsync(questionId, body), JsonApi.Options);
        });

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

        app.MapPost("/portal/questions/{questionId}/duplicate", async (HttpContext http) =>
        {
            var user = await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
            var questionId = Validate.RouteUuid(http, "questionId");
            var service = http.RequestServices.GetRequiredService<QuestionsService>();
            var row = await service.DuplicateQuestionAsync(new QuestionsService.WriteContext(user.Id), questionId);
            http.Response.StatusCode = 201;
            return Results.Json(row, JsonApi.Options);
        });

        app.MapGet("/portal/questions/{questionId}/usage", async (HttpContext http) =>
        {
            await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
            var questionId = Validate.RouteUuid(http, "questionId");
            var service = http.RequestServices.GetRequiredService<QuestionsService>();
            await service.RequireQuestionAsync(questionId);
            var usage = http.RequestServices.GetRequiredService<QuestionUsageStore>();
            var items = await usage.QuestionUsageAsync(questionId);
            return Results.Json(new { items }, JsonApi.Options);
        });

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

    private static Guid ParseUuid(string raw, string name)
    {
        if (!Guid.TryParse(raw, out var parsed))
            throw ApiException.BadRequest($"{name}: Expected string with format 'uuid'");
        return parsed;
    }

    private sealed record BulkQuestionsAudit(
        string Action, string? Status, string? Bucket, int Requested, int Affected);

    private static Task AuditBulkAsync(HttpContext http, QuestionsService.BulkQuestionsReport report,
        QuestionStatus? status, string? bucket)
    {
        var user = http.Items.TryGetValue(Guards.SessionUserKey, out var u)
            ? u as Infrastructure.Data.Entities.UserEntity
            : null;
        var audit = http.RequestServices.GetRequiredService<AOC.Infrastructure.Audit.AuditService>();
        return audit.AuditAsync(new AOC.Infrastructure.Audit.AuditEvent
        {
            Action = "questions_bulk",
            ActorId = user?.Id,
            Ip = http.Connection.RemoteIpAddress?.ToString(),
            UserAgent = http.Request.Headers.UserAgent.ToString(),
            Details = new BulkQuestionsAudit(
                report.Action, status?.ToString(), bucket, report.Total, report.Affected)
        });
    }

    private static readonly Dictionary<string, string> GateActions = new()
    {
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
        var audit = http.RequestServices.GetRequiredService<AOC.Infrastructure.Audit.AuditService>();
        return audit.AuditAsync(new AOC.Infrastructure.Audit.AuditEvent
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
}
