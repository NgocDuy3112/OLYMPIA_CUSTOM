using Microsoft.EntityFrameworkCore;
using Olympia.Api.Http;
using Olympia.Api.Modules.Auth;
using Olympia.Infrastructure.Auth;
using Olympia.Infrastructure.Configuration;
using Olympia.Infrastructure.Data;

namespace Olympia.Tests.Auth;


internal static class AuthTestDb
{
    private static readonly string[] RequiredSecrets =
        ["GAMEPLAY_JWT_SECRET", "PORTAL_JWT_SECRET"];

    private static readonly string[] RequiredPostgres =
        ["POSTGRES_USER", "POSTGRES_PASSWORD", "POSTGRES_DB", "POSTGRES_HOST", "POSTGRES_PORT"];

    private static bool Present(string name)
        => !string.IsNullOrEmpty(Environment.GetEnvironmentVariable(name));

    public static bool EnvironmentReady()
        => RequiredSecrets.All(Present) && RequiredPostgres.All(Present);

    public static string ConnectionString()
    {
        var cfg = AppConfig.Instance; // safe: EnvironmentReady() ran first
        return cfg.DatabaseUrl;
    }

    public static bool DatabaseReady()
    {
        if (!EnvironmentReady()) return false;
        try
        {
            using var connection = new Npgsql.NpgsqlConnection(ConnectionString());
            connection.Open();
            return true;
        }
        catch
        {
            return false;
        }
    }

    private static readonly SemaphoreSlim SchemaGate = new(1, 1);
    private static bool _schemaReady;

    public static async Task EnsureSchemaAsync()
    {
        if (_schemaReady) return;

        await SchemaGate.WaitAsync();
        try
        {
            if (_schemaReady) return;
            await MigrationRunner.RunAsync(ConnectionString(), MigrationsFolder());
            _schemaReady = true;
        }
        finally
        {
            SchemaGate.Release();
        }
    }

    private static string? _migrationsFolder;

    public static string MigrationsFolder()
    {
        if (_migrationsFolder is not null) return _migrationsFolder;

        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null)
        {
            var candidate = Path.Combine(dir.FullName, "migrations", "meta", "_journal.json");
            if (File.Exists(candidate))
            {
                _migrationsFolder = Path.Combine(dir.FullName, "migrations");
                return _migrationsFolder;
            }
            dir = dir.Parent;
        }
        throw new InvalidOperationException("migrations/meta/_journal.json not found above " +
            AppContext.BaseDirectory);
    }

    public static OlympiaDbContext OpenDb()
    {
        var options = new DbContextOptionsBuilder<OlympiaDbContext>()
            .Configure<OlympiaDbContext>(ConnectionString())
            .Options;
        return new OlympiaDbContext(options);
    }
}
