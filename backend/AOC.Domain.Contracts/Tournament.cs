using System.Text.Json.Serialization;

namespace AOC.Domain.Contracts;

public sealed record Stage
{
    [JsonPropertyName("id")] public required string Id { get; init; }
    [JsonPropertyName("title")] public required string Title { get; init; }

    [JsonPropertyName("start")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Start { get; init; }

    [JsonPropertyName("end")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? End { get; init; }
}

public sealed record TournamentRound
{
    [JsonPropertyName("id")] public required string Id { get; init; }
    [JsonPropertyName("name")] public required string Name { get; init; }
    [JsonPropertyName("order")] public required int Order { get; init; }
    [JsonPropertyName("chart")] public required string Chart { get; init; }
}

public sealed record TournamentFormat
{
    [JsonPropertyName("competitorsPerMatch")] public required int CompetitorsPerMatch { get; init; }

    [JsonPropertyName("allowedCompetitorCounts")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public List<int>? AllowedCompetitorCounts { get; init; }
}

public static class TournamentFormatExtensions
{
    public static List<int> AllowedSeatCounts(this TournamentFormat format)
        => format.AllowedCompetitorCounts ?? [format.CompetitorsPerMatch];
}
