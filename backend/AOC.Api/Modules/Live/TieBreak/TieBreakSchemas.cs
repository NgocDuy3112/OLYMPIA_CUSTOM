using System.Text.Json;
using AOC.Api.Http;

namespace AOC.Api.Modules.Live.TieBreak;

public abstract record TieBreakAction
{
    public sealed record Start(IReadOnlyList<string> PlayerIds) : TieBreakAction;
    public sealed record OpenBuzz : TieBreakAction;
    public sealed record LockBuzz : TieBreakAction;
    public sealed record Judge(bool Correct) : TieBreakAction;
    public sealed record Advance : TieBreakAction;
    public sealed record End : TieBreakAction;
}

public static class TieBreakSchemas
{
    public static int ExpectedVersion(JsonElement body)
    {
        if (!body.TryGetProperty("expectedVersion", out var raw)) return -1;
        if (raw.ValueKind != JsonValueKind.Number || !raw.TryGetInt32(out var version))
            throw ApiException.BadRequest("body/expectedVersion: Expected integer");
        return version;
    }

    public static TieBreakAction Parse(JsonElement body)
    {
        var action = Validate.RequiredString(body, "action");
        return action switch
        {
            "start" => new TieBreakAction.Start(
                Validate.RequiredArray(body, "playerIds", minItems: 2).Select(PlayerId).ToList()),
            "open-buzz" => new TieBreakAction.OpenBuzz(),
            "lock-buzz" => new TieBreakAction.LockBuzz(),
            "judge" => new TieBreakAction.Judge(CorrectOf(body)),
            "advance" => new TieBreakAction.Advance(),
            "end" => new TieBreakAction.End(),
            _ => throw ApiException.BadRequest(
                "body/action: Expected one of start, open-buzz, lock-buzz, judge, advance, end")
        };
    }

    private static bool CorrectOf(JsonElement body)
    {
        if (!body.TryGetProperty("correct", out var raw))
            throw ApiException.BadRequest("body must have required property 'correct'");
        if (raw.ValueKind is not (JsonValueKind.True or JsonValueKind.False))
            throw ApiException.BadRequest("body/correct: Expected boolean");
        return raw.GetBoolean();
    }

    private static string PlayerId(JsonElement raw)
    {
        if (raw.ValueKind != JsonValueKind.String)
            throw ApiException.BadRequest("body/playerIds: Expected array of uuid strings");
        var value = raw.GetString()!;
        if (!Guid.TryParse(value, out _))
            throw ApiException.BadRequest("body/playerIds: Expected array of uuid strings");
        return value;
    }
}
