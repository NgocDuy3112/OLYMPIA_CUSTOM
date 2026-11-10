using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Microsoft.IdentityModel.Tokens;
using Olympia.Infrastructure.Configuration;
using Olympia.Infrastructure.Rtc;
using Xunit;

namespace Olympia.Tests.Rtc;

/// <summary>Port of tests/unit/rtc/tokens.test.ts — LiveKit token minting.</summary>
public class RtcTokenTests
{
    // Read from the environment (TestEnvDefaults seeds defaults at assembly
    // load) — Mint() signs with whatever AppConfig resolved, so verification
    // must use the same key even when a runner supplies its own secrets.
    private static readonly string ApiKey =
        Environment.GetEnvironmentVariable("LIVEKIT_API_KEY") ?? "oc_test_key";
    private static readonly string ApiSecret =
        Environment.GetEnvironmentVariable("LIVEKIT_API_SECRET")
        ?? "test-secret-of-at-least-32-characters-0123456789";
    private static readonly string Url =
        Environment.GetEnvironmentVariable("LIVEKIT_URL") ?? "http://localhost:7880";

    private static (RtcToken Token, JwtSecurityToken Claims) Minted(RtcRole role,
        string? userId = null, string? name = null)
    {
        var token = RtcTokens.Mint(role, "match-42", userId, name);
        var claims = Verify(token.Token);
        return (token, claims);
    }

    private static JwtSecurityToken Verify(string token)
    {
        var handler = new JwtSecurityTokenHandler { MapInboundClaims = false };
        handler.ValidateToken(token, new TokenValidationParameters
        {
            ValidateIssuer = false,
            ValidateAudience = false,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(ApiSecret)),
            ClockSkew = TimeSpan.FromSeconds(5)
        }, out var validated);
        return (JwtSecurityToken)validated;
    }

    private static Dictionary<string, JsonElement> VideoClaim(JwtSecurityToken claims)
    {
        var raw = claims.Claims.First(c => c.Type == "video").Value;
        return JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(raw)!;
    }

    [Fact]
    public void Player_IdentityIsUserId_MayPublishAndSubscribe()
    {
        var (token, claims) = Minted(RtcRole.Player, "u-7");

        Assert.Equal("u-7", token.Identity);
        Assert.Equal("u-7", claims.Claims.First(c => c.Type == "sub").Value);
        var video = VideoClaim(claims);
        Assert.Equal("match-42", video["room"].GetString());
        Assert.True(video["roomJoin"].GetBoolean());
        Assert.True(video["canPublish"].GetBoolean());
        Assert.True(video["canSubscribe"].GetBoolean());
        Assert.False(video.TryGetValue("hidden", out var hidden) && hidden.GetBoolean());
        Assert.Equal(Url, token.Url);
    }

    [Fact]
    public void Operator_SubscribesCannotPublishStaysHidden()
    {
        var (_, claims) = Minted(RtcRole.Operator, "console-1");

        Assert.Equal("console-1", claims.Claims.First(c => c.Type == "sub").Value);
        var video = VideoClaim(claims);
        Assert.True(video["roomJoin"].GetBoolean());
        Assert.False(video["canPublish"].GetBoolean());
        Assert.True(video["canSubscribe"].GetBoolean());
        Assert.True(video["hidden"].GetBoolean());
    }

    [Fact]
    public void Spectator_RandomIdentityHiddenSubscribeOnly()
    {
        var first = Minted(RtcRole.Spectator);
        var second = Minted(RtcRole.Spectator);

        Assert.Matches("^spectator-[0-9a-f]{16}$", first.Token.Identity);
        Assert.Equal(first.Token.Identity, first.Claims.Claims.First(c => c.Type == "sub").Value);
        Assert.NotEqual(second.Token.Identity, first.Token.Identity);

        var video = VideoClaim(first.Claims);
        Assert.True(video["roomJoin"].GetBoolean());
        Assert.False(video["canPublish"].GetBoolean());
        Assert.True(video["canSubscribe"].GetBoolean());
        Assert.True(video["hidden"].GetBoolean());
    }

    [Fact]
    public void CarriesTheDisplayNameWhenGiven()
    {
        var (_, claims) = Minted(RtcRole.Player, "u-7", "Ngọc Duy");
        Assert.Equal("Ngọc Duy", claims.Claims.First(c => c.Type == "name").Value);
    }

    [Fact]
    public void RefusesPlayerOrOperatorTokenWithoutUserId()
    {
        Assert.Throws<InvalidOperationException>(() => RtcTokens.Mint(RtcRole.Player, "m"));
        Assert.Throws<InvalidOperationException>(() => RtcTokens.Mint(RtcRole.Operator, "m"));
    }

    [Fact]
    public void ExpiresAfterTheDocumentedTtl()
    {
        var (_, claims) = Minted(RtcRole.Spectator);
        var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var exp = new DateTimeOffset(claims.ValidTo, TimeSpan.Zero).ToUnixTimeSeconds();
        Assert.True(Math.Abs(exp - (now + RtcTokens.RtcTokenTtlSeconds)) < 10,
            $"exp={exp} now={now}");
    }

    [Fact]
    public void IsConfigured_AcceptsCompleteConfigRejectsPartial()
    {
        var full = new LivekitOptions(Url, "k", "s", null);
        Assert.True(RtcTokens.IsConfigured(full));
        Assert.False(RtcTokens.IsConfigured(new LivekitOptions(Url, null, "s", null)));
        Assert.False(RtcTokens.IsConfigured(new LivekitOptions(Url, "k", null, null)));
        Assert.False(RtcTokens.IsConfigured(new LivekitOptions(null, "k", "s", null)));
    }
}
