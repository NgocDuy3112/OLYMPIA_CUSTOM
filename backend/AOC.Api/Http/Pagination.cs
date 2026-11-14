namespace AOC.Api.Http;

public sealed class PaginationError(string message) : Exception(message);

public sealed record Page(int Limit, int Offset);

public sealed record PageResult<T>(List<T> Items, int Total, int Limit, int Offset);


public static class Pagination
{
    public const int DefaultLimit = 20;
    public const int MaxLimit = 100;

    private static int ParseCount(string? raw, string field, int fallback)
    {
        if (raw is null or "") return fallback;
        if (!raw.All(char.IsDigit))
            throw new PaginationError($"{field} must be a non-negative integer");
        return int.Parse(raw);
    }

    public static Page ParsePage(IReadOnlyDictionary<string, string?> query, int maxLimit = MaxLimit)
    {
        var limit = ParseCount(query.GetValueOrDefault("limit"), "limit", DefaultLimit);
        var offset = ParseCount(query.GetValueOrDefault("offset"), "offset", 0);

        if (limit < 1 || limit > maxLimit)
            throw new PaginationError($"limit must be between 1 and {maxLimit}");

        return new Page(limit, offset);
    }

    public static PageResult<T> Result<T>(List<T> items, int total, Page page)
        => new(items, total, page.Limit, page.Offset);
}
