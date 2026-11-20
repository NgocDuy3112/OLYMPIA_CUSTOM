using AOC.Domain.Contracts;
using AOC.Infrastructure.Data;

namespace AOC.Api.Modules.Questions.Reads;

public sealed record QuestionFilter(
    QuestionStatus? Status = null,
    QuestionKind? Kind = null,
    Guid? KeywordId = null,
    string? Search = null,
    List<Guid>? Ids = null,
    string? Bucket = null
);
