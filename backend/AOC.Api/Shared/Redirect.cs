namespace AOC.Api.Shared;

public static class Redirects
{
    public static string SafeNextPath(string? raw)
    {
        if (raw is null) return "/";
        if (!raw.StartsWith('/')) return "/";
        if (raw.StartsWith("//") || raw.StartsWith("/\\")) return "/";
        if (raw.Any(c => c < 0x20 || c == 0x7f)) return "/";
        return raw;
    }
}
