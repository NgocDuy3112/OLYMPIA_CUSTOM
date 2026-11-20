using System.Text.Json.Serialization;

namespace AOC.Domain.Contracts;

public sealed record MatchQuestion
{
    [JsonPropertyName("_id")] public required string Id { get; init; }
    [JsonPropertyName("roundId")] public required string RoundId { get; init; }
    [JsonPropertyName("turnId")] public required string TurnId { get; init; }
    [JsonPropertyName("position")] public required int Position { get; init; }
    [JsonPropertyName("mode")] public required QuestionMode Mode { get; init; }
    [JsonPropertyName("kind")] public required QuestionKind Kind { get; init; }
    [JsonPropertyName("questionText")] public required string QuestionText { get; init; }
    [JsonPropertyName("media")] public Media? Media { get; init; }
    [JsonPropertyName("points")] public required int Points { get; init; }
    [JsonPropertyName("payload")] public required QuestionPayload Payload { get; init; }
    [JsonPropertyName("sourceId")] public required string SourceId { get; init; }
}
