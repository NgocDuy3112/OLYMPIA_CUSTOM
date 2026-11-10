using System.Runtime.CompilerServices;

namespace Olympia.Tests;

/// <summary>
/// Runs at test-assembly load — BEFORE any test class static ctor touches
/// AppConfig (which reads the environment exactly once, process-wide).
/// Values are defaults only: an explicit runner environment always wins.
/// </summary>
internal static class TestEnvDefaults
{
    [ModuleInitializer]
    internal static void Init()
    {
        SetIfAbsent("GAMEPLAY_JWT_SECRET", "test-gameplay-secret-0123456789abcdef0123456789abcdef");
        SetIfAbsent("PORTAL_JWT_SECRET", "test-portal-secret-0123456789abcdef0123456789abcdef");
        SetIfAbsent("POSTGRES_USER", "ci");
        SetIfAbsent("POSTGRES_PASSWORD", "ci");
        SetIfAbsent("POSTGRES_DB", "olympia");
        SetIfAbsent("POSTGRES_HOST", "localhost");
        SetIfAbsent("POSTGRES_PORT", "5432");
        SetIfAbsent("LIVEKIT_URL", "http://localhost:7880");
        SetIfAbsent("LIVEKIT_API_KEY", "oc_test_key");
        SetIfAbsent("LIVEKIT_API_SECRET", "test-secret-of-at-least-32-characters-0123456789");
    }

    private static void SetIfAbsent(string key, string value)
    {
        if (Environment.GetEnvironmentVariable(key) is null)
            Environment.SetEnvironmentVariable(key, value);
    }
}
