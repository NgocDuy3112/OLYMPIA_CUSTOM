namespace AOC.Infrastructure.Configuration;

public static class CookieNames
{
    public const string Gameplay = "gameplay_session";
    public const string Portal = "portal_session";

    public static string For(Surface surface) => surface == Surface.GAMEPLAY ? Gameplay : Portal;
}
