namespace AOC.Api.Modules.Live;

public sealed record AdjustFact(
    string UserId,
    int Delta,
    string Reason,
    string ActorId) : LiveFact
{
    public const string TypeName = "adjust";
}
