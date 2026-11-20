using System.Text.Json.Serialization;

namespace AOC.Domain.Contracts;

public sealed record MatchLive
{
    [JsonPropertyName("phase")] public required MatchLivePhase Phase { get; init; }
    [JsonPropertyName("questionId")] public required string QuestionId { get; init; }
    [JsonPropertyName("openedAt")] public required string OpenedAt { get; init; }
    [JsonPropertyName("deadlineAt")] public required string DeadlineAt { get; init; }
}
