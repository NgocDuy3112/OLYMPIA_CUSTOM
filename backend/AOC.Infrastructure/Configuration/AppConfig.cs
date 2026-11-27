namespace AOC.Infrastructure.Configuration;

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

        DiscordLog = new DiscordLogOptions(
            Optional("DISCORD_WEBHOOK_URL"),
            Optional("DISCORD_LOG_LEVEL") ?? "Warning");
        Smtp = new SmtpOptions(
            Optional("SMTP_HOST"),
            ParseSmtpPort(Optional("SMTP_PORT")),
            Optional("SMTP_USER"),
            Optional("SMTP_PASSWORD"),
            Optional("SMTP_FROM"));
        SeedAdminPassword = Optional("SEED_ADMIN_PASSWORD");
        SeedAdminUsername = Optional("SEED_ADMIN_USERNAME");
        AuditRetentionDays = ParseRetentionDays(Optional("AUDIT_RETENTION_DAYS") ?? "180");
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
    public DiscordLogOptions DiscordLog { get; }
    public SmtpOptions Smtp { get; }
    public string? SeedAdminPassword { get; }
    public string? SeedAdminUsername { get; }
    public string[] CorsOrigins { get; }
    public int AuditRetentionDays { get; }

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

    private static int ParseSmtpPort(string? raw)
    {
        if (string.IsNullOrEmpty(raw))
            return 587;
        var parsed = int.TryParse(raw, out var value);
        if (!parsed)
            throw new InvalidOperationException($"Invalid SMTP_PORT: {raw}");
        if (value < 1)
            throw new InvalidOperationException($"Invalid SMTP_PORT: {raw}");
        if (value > 65535)
            throw new InvalidOperationException($"Invalid SMTP_PORT: {raw}");
        return value;
    }

    private static int ParseRetentionDays(string raw)
    {
        if (!int.TryParse(raw, out var value))
            throw new InvalidOperationException($"Invalid AUDIT_RETENTION_DAYS: {raw}");
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
