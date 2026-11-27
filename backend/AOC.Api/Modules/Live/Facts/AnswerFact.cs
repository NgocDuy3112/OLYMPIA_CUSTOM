using System.Text.Json;
using AOC.Domain.Contracts;

namespace AOC.Api.Modules.Live;

public sealed record AnswerFact(
    string QuestionId,
    string UserId,
    JsonElement Value,
    Verdict Verdict,
    int PointsAwarded) : LiveFact
{
    public const string TypeName = "answer";
}
