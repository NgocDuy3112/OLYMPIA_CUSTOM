namespace AOC.Infrastructure.Configuration;

public sealed record DiscordLogOptions(string? WebhookUrl, string Level)
{
    public bool Configured => !string.IsNullOrEmpty(WebhookUrl);
}
