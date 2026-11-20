using System.Text.Json;

namespace AOC.Api.Modules.Live;

public sealed record EventFact(
    string QuestionId,
    string UserId,
    string? RoundId,
    MatchEventKind Kind,
    JsonElement Payload) : LiveFact
{
    public const string TypeName = "event";
}
