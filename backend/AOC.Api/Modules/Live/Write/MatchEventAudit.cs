using System.Text.Json;

namespace AOC.Api.Modules.Live;

public static class MatchEventAudit
{
    /// <summary>
    /// A POWER use is one (question, player, power) triple. Powers re-arm on every
    /// turn, so a player legitimately logs the same power again on a later question
    /// of the same round — only a replay of the same question's fact is a duplicate.
    /// </summary>
    public static bool PowerLogged(
        IEnumerable<(Guid QuestionId, JsonElement Payload)> logged, Guid questionId, string? power)
        => logged.Any(e => e.QuestionId == questionId
            && e.Payload.TryGetProperty("power", out var existing)
            && existing.GetString() == power);
}
