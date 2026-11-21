using AOC.Domain.Contracts;

namespace AOC.Api.Modules.Live;

public sealed record JudgeFact(
    string QuestionId,
    string UserId,
    Verdict Verdict,
    int PointsAwarded) : LiveFact
{
    public const string TypeName = "judge";
}
