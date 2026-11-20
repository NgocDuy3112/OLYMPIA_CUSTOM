using AOC.Api.Http;
using AOC.Domain.Contracts;
using AOC.Infrastructure.Data;

namespace AOC.Api.Modules.Questions.Reads;

public interface IQuestionReads
{
    Task<PageResult<QuestionRow>> ListAsync(QuestionFilter filter, Page page);
    Task<QuestionRow> RequireAsync(string id);
    Task<Dictionary<string, int>> BucketCountsAsync(QuestionStatus? status, string? search);
}
