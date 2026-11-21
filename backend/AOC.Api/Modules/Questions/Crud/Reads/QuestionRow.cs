using System.Text.Json;
using AOC.Domain.Contracts;
using AOC.Infrastructure.Data;
using AOC.Infrastructure.Data.Entities;

namespace AOC.Api.Modules.Questions.Reads;

public sealed record QuestionRow(
    Guid Id,
    QuestionKind Kind,
    string QuestionText,
    Guid? KeywordId,
    JsonElement? Media,
    JsonElement Payload,
    QuestionStatus Status,
    string[] Tags,
    Guid CreatedBy,
    Guid? ImportBatchId,
    DateTime CreatedAt,
    DateTime UpdatedAt)
{
    public static QuestionRow Of(QuestionBankEntity row) => new(
        row.Id,
        row.Kind,
        row.QuestionText,
        row.KeywordId,
        row.Media,
        row.Payload,
        row.Status,
        row.Tags,
        row.CreatedBy,
        row.ImportBatchId,
        row.CreatedAt,
        row.UpdatedAt);
}
