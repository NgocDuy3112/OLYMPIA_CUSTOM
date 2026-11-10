using Livekit.Server.Sdk.Dotnet;
using Olympia.Infrastructure.Configuration;

namespace Olympia.Infrastructure.Rtc;

public enum RtcRole
{
    Player,
    Operator,
    Spectator
}

public sealed record RtcToken(string Url, string Token, string Identity, int ExpiresIn);

/// <summary>Port of rtc/tokens.ts — LiveKit access tokens with per-role grants.</summary>
public static class RtcTokens
{
    public const int RtcTokenTtlSeconds = 6 * 60 * 60;

    private static readonly Dictionary<RtcRole, (bool Publish, bool Hidden)> Grants = new()
    {
        [RtcRole.Player] = (Publish: true, Hidden: false),
        [RtcRole.Operator] = (Publish: false, Hidden: true),
        [RtcRole.Spectator] = (Publish: false, Hidden: true)
    };

    public static bool IsConfigured(LivekitOptions options) => options.Configured;

    public static bool IsConfigured() => IsConfigured(AppConfig.Instance.Livekit);

    private static string IdentityFor(RtcRole role, string? userId)
    {
        if (role == RtcRole.Spectator)
            return $"spectator-{Convert.ToHexString(Guid.NewGuid().ToByteArray()).ToLowerInvariant()[..16]}";
        if (string.IsNullOrEmpty(userId))
            throw new InvalidOperationException($"rtc: userId is required for role {role}");
        return userId;
    }

    public static RtcToken Mint(RtcRole role, string room, string? userId = null, string? name = null)
    {
        var livekit = AppConfig.Instance.Livekit;
        if (!livekit.Configured)
            throw new InvalidOperationException("rtc is not configured");

        var grant = Grants[role];
        var identity = IdentityFor(role, userId);

        var accessToken = new AccessToken(livekit.ApiKey!, livekit.ApiSecret!)
            .WithIdentity(identity)
            .WithTtl(TimeSpan.FromSeconds(RtcTokenTtlSeconds))
            .WithGrants(new VideoGrants
            {
                RoomJoin = true,
                Room = room,
                CanPublish = grant.Publish,
                CanSubscribe = true,
                Hidden = grant.Hidden
            });
        if (name is not null)
            accessToken = accessToken.WithName(name);

        var token = accessToken.ToJwt();
        return new RtcToken(livekit.Url!, token, identity, RtcTokenTtlSeconds);
    }
}
