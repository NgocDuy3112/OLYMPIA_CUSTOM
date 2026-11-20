using System.Text.Json;
using AOC.Domain.Contracts;

namespace AOC.Api.Modules.Live;

public sealed record DraftFact(
    string QuestionId,
    string UserId,
    JsonElement Value,
    Verdict Suggestion) : LiveFact
{
    public const string TypeName = "draft";
}
