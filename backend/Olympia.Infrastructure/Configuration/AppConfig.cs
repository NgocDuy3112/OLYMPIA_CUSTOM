namespace Olympia.Infrastructure.Configuration;

public enum Surface
{
    GAMEPLAY,
    PORTAL
}

public static class CookieNames
{
    public const string Gameplay = "gameplay_session";
    public const string Portal = "portal_session";

    public static string For(Surface surface) => surface == Surface.GAMEPLAY ? Gameplay : Portal;
}

/// <summary>Port of config/env.ts + config/database-url.ts — read once from the environment.</summary>
public sealed class AppConfig
{
    public static AppConfig Instance { get; } = new();

    private AppConfig()
    {
        NodeEnv = Environment.GetEnvironmentVariable("NODE_ENV") ?? Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT") ?? "development";
        IsProduction = NodeEnv == "production";
        Port = ParsePort(Environment.GetEnvironmentVariable("PORT"));

        DatabaseUrl = BuildDatabaseUrl();

        Gameplay = new SurfaceSecrets(
            Required("GAMEPLAY_JWT_SECRET"),
            Optional("GAMEPLAY_COOKIE_DOMAIN"));
        Portal = new SurfaceSecrets(
            Required("PORTAL_JWT_SECRET"),
            Optional("PORTAL_COOKIE_DOMAIN"));

        GoogleOidc = new GoogleOidcOptions(
            Optional("GOOGLE_OIDC_ISSUER"),
            Optional("GOOGLE_OIDC_CLIENT_ID"),
            Optional("GOOGLE_OIDC_CLIENT_SECRET"),
            Optional("GOOGLE_OIDC_REDIRECT_URI"));

        S3 = new S3Options(
            Optional("S3_ENDPOINT"),
            Optional("S3_REGION") ?? "us-east-1",
            Optional("S3_BUCKET"),
            Optional("S3_ACCESS_KEY_ID"),
            Optional("S3_SECRET_ACCESS_KEY"));

        Livekit = new LivekitOptions(
            Optional("LIVEKIT_URL"),
            Optional("LIVEKIT_API_KEY"),
            Optional("LIVEKIT_API_SECRET"),
            Optional("LIVEKIT_INTERNAL_URL"));

        RecordPageBaseUrl = Optional("RECORD_PAGE_BASE_URL");
        SeedAdminPassword = Optional("SEED_ADMIN_PASSWORD");
        SeedAdminUsername = Optional("SEED_ADMIN_USERNAME") ?? "ADMIN";
        CorsOrigins = (Environment.GetEnvironmentVariable("CORS_ORIGINS") ?? "")
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
    }

    public string NodeEnv { get; }
    public bool IsProduction { get; }
    public int Port { get; }
    public string DatabaseUrl { get; }
    public SurfaceSecrets Gameplay { get; }
    public SurfaceSecrets Portal { get; }
    public GoogleOidcOptions GoogleOidc { get; }
    public S3Options S3 { get; }
    public LivekitOptions Livekit { get; }
    public string? RecordPageBaseUrl { get; }
    public string? SeedAdminPassword { get; }
    public string SeedAdminUsername { get; }
    public string[] CorsOrigins { get; }

    public SurfaceSecrets For(Surface surface) => surface == Surface.GAMEPLAY ? Gameplay : Portal;

    private static string? Optional(string name)
        => Environment.GetEnvironmentVariable(name) is { Length: > 0 } value ? value : null;

    private static string Required(string name)
        => Optional(name) ?? throw new InvalidOperationException($"Missing required environment variable: {name}");

    private static int ParsePort(string? raw)
    {
        raw ??= "3000";
        if (!int.TryParse(raw, out var value) || value < 1 || value > 65535)
            throw new InvalidOperationException($"Invalid PORT: {raw}");
        return value;
    }

    private static string BuildDatabaseUrl()
    {
        static string Enc(string name) => Uri.EscapeDataString(Required(name));
        return $"Host={Required("POSTGRES_HOST")};Port={Required("POSTGRES_PORT")};" +
               $"Username={Enc("POSTGRES_USER")};Password={Enc("POSTGRES_PASSWORD")};" +
               $"Database={Enc("POSTGRES_DB")}";
    }
}

public sealed record SurfaceSecrets(string JwtSecret, string? CookieDomain);

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

public sealed record S3Options(
    string? Endpoint,
    string Region,
    string? Bucket,
    string? AccessKeyId,
    string? SecretAccessKey)
{
    public bool Configured =>
        !string.IsNullOrEmpty(Bucket) && !string.IsNullOrEmpty(AccessKeyId)
        && !string.IsNullOrEmpty(SecretAccessKey);
}

public sealed record LivekitOptions(
    string? Url,
    string? ApiKey,
    string? ApiSecret,
    string? InternalUrl)
{
    public bool Configured =>
        !string.IsNullOrEmpty(Url) && !string.IsNullOrEmpty(ApiKey) && !string.IsNullOrEmpty(ApiSecret);
}
