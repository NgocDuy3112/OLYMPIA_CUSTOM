using System.Text.Json.Serialization;

namespace AOC.Domain.Contracts;

public sealed record MatchDiscord
{
    [JsonPropertyName("announcementChannelId")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? AnnouncementChannelId { get; init; }

    [JsonPropertyName("announcementMessageId")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? AnnouncementMessageId { get; init; }

    [JsonPropertyName("liveBoardMessageId")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? LiveBoardMessageId { get; init; }

    [JsonPropertyName("lobbyChannelId")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? LobbyChannelId { get; init; }

    [JsonPropertyName("boothChannelId")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? BoothChannelId { get; init; }
}
