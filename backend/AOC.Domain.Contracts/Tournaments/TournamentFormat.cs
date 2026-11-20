using System.Text.Json.Serialization;

namespace AOC.Domain.Contracts;

public sealed record TournamentFormat
{
    [JsonPropertyName("competitorsPerMatch")] public required int CompetitorsPerMatch { get; init; }

    [JsonPropertyName("allowedCompetitorCounts")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public List<int>? AllowedCompetitorCounts { get; init; }
}
