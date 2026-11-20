namespace AOC.Infrastructure.Configuration;

public sealed record GoogleOidcOptions(
    string? Issuer,
    string? ClientId,
    string? ClientSecret,
    string? RedirectUri)
{
    public bool Configured =>
        !string.IsNullOrEmpty(Issuer) && !string.IsNullOrEmpty(ClientId)
        && !string.IsNullOrEmpty(ClientSecret) && !string.IsNullOrEmpty(RedirectUri);
}
