using System.Globalization;
using System.Text.RegularExpressions;
using AOC.Api.Http;

namespace AOC.Api.Modules.Audit;

public static class AuditQuery
{
    public const int MaxSearchLength = 200;

    private static readonly Regex ActionToken = new("^[a-z0-9_]+$", RegexOptions.Compiled);

    public static AuditFilter From(IReadOnlyDictionary<string, string?> query) => new()
    {
        Actions = SplitActions(query.GetValueOrDefault("action")),
        ActorId = Uuid(query.GetValueOrDefault("actorId"), "actorId"),
        TargetId = Uuid(query.GetValueOrDefault("targetId"), "targetId"),
        MatchId = Uuid(query.GetValueOrDefault("matchId"), "matchId"),
        From = Instant(query.GetValueOrDefault("from"), "from"),
        To = Instant(query.GetValueOrDefault("to"), "to"),
        Search = Search(query.GetValueOrDefault("q"))
    };

    private static IReadOnlyList<string> SplitActions(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return [];
        var tokens = raw.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Distinct(StringComparer.Ordinal)
            .ToList();
        foreach (var token in tokens)
            if (!ActionToken.IsMatch(token))
                throw ApiException.BadRequest("action: Expected comma-separated snake_case names");
        return tokens;
    }

    private static Guid? Uuid(string? raw, string field)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;
        if (!Guid.TryParse(raw, out var parsed))
            throw ApiException.BadRequest($"{field}: Expected string with format 'uuid'");
        return parsed;
    }

    private static DateTime? Instant(string? raw, string field)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;
        if (!DateTime.TryParse(raw, CultureInfo.InvariantCulture,
                DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal, out var parsed))
            throw ApiException.BadRequest($"{field}: Expected string with format 'date-time'");
        return parsed;
    }

    private static string? Search(string? raw)
    {
        var trimmed = raw?.Trim();
        if (string.IsNullOrEmpty(trimmed)) return null;
        if (trimmed.Length > MaxSearchLength)
            throw ApiException.BadRequest($"q: String must have at most {MaxSearchLength} characters");
        return trimmed;
    }
}
