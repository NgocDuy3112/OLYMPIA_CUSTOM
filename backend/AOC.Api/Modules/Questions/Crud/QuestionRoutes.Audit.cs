using System.Text.Json;
using AOC.Api.Http;
using AOC.Api.Shared;
using AOC.Domain.Contracts;
using AOC.Infrastructure.Data;
using AOC.Infrastructure.Audit;
using AOC.Infrastructure.Data.Entities;

namespace AOC.Api.Modules.Questions;

public static partial class QuestionRoutes
{
    private sealed record BulkQuestionsAudit(
        string Action, string? Status, string? Bucket, int Requested, int Affected);

    private sealed record QuestionGateAudit(Guid QuestionId, string Kind);

    private static Task AuditBulkAsync(HttpContext http, QuestionsService.BulkQuestionsReport report,
        QuestionStatus? status, string? bucket)
    {
        var audit = http.RequestServices.GetRequiredService<AuditService>();
        return audit.AuditAsync(http, AuditTarget.None, "questions_bulk",
            new BulkQuestionsAudit(report.Action, status?.ToString(), bucket, report.Total, report.Affected));
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

        var audit = http.RequestServices.GetRequiredService<AuditService>();
        return audit.AuditAsync(http, AuditTarget.None, action,
            new QuestionGateAudit(question.Id, question.Kind.ToString()));
    }
}
