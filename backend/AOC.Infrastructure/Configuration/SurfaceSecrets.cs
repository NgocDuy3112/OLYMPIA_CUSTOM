namespace AOC.Infrastructure.Configuration;

public sealed record SurfaceSecrets(string JwtSecret, string? CookieDomain);
