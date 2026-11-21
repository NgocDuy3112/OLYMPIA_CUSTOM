namespace AOC.Api.Modules.Live;

public sealed record RegradeFact(
    string QuestionId,
    string UserId,
    int PointsAwarded) : LiveFact
{
    public const string TypeName = "regrade";
}
