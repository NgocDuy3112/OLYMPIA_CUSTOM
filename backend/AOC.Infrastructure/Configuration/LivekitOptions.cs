namespace AOC.Infrastructure.Configuration;

public sealed record LivekitOptions(
    string? Url,
    string? ApiKey,
    string? ApiSecret,
    string? InternalUrl)
{
    public bool Configured =>
        !string.IsNullOrEmpty(Url) && !string.IsNullOrEmpty(ApiKey) && !string.IsNullOrEmpty(ApiSecret);
}
