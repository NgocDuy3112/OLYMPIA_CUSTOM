using System.Text.Json.Serialization;

namespace AOC.Domain.Contracts;

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum MatchLivePhase
{
    question_open,
    judging,
    paused
}
