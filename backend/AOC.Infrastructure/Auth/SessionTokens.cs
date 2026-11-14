using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.IdentityModel.Tokens;
using AOC.Infrastructure.Configuration;

namespace AOC.Infrastructure.Auth;

public sealed record SessionTokenPayload(string Sub, string Role, int TokenVersion);
public sealed record PendingMfaToken(string Sub, string Purpose);
public sealed record OauthPendingToken(string State, string Nonce, string CodeVerifier, string Purpose, string? Next);
public sealed record InviteToken(string Sub, int TokenVersion, string Purpose);

/// <summary>
/// Port of lib/jwt.ts — HS256 session/pending/invite tokens, one secret per surface,
/// aud = surface, matching fastify-jwt's claims and expiries.
/// </summary>
public sealed class SessionTokens
{
    private static readonly JwtSecurityTokenHandler Handler = new() { MapInboundClaims = false };

    /// <summary>
    /// HS256 needs &gt; 256 bits. Secrets from `openssl rand -hex 32` (documented)
    /// are used raw — byte-compatible with tokens the old fastify backend signed.
    /// Short legacy secrets are SHA-256 derived so sign-in keeps working (old
    /// short-secret sessions simply expire and users log in again).
    /// </summary>
    private static byte[] KeyBytes(string secret)
    {
        var bytes = Encoding.UTF8.GetBytes(secret);
        return bytes.Length * 8 > 256 ? bytes : System.Security.Cryptography.SHA256.HashData(bytes);
    }

    private static string Sign(Surface surface, IEnumerable<Claim> claims, TimeSpan lifetime)
    {
        var secret = AppConfig.Instance.For(surface).JwtSecret;
        var key = new SymmetricSecurityKey(KeyBytes(secret));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var now = DateTime.UtcNow;
        var allClaims = claims.Concat(new[]
        {
            new Claim(JwtRegisteredClaimNames.Aud, surface.ToString()),
            new Claim(JwtRegisteredClaimNames.Iat, new DateTimeOffset(now).ToUnixTimeSeconds().ToString(), ClaimValueTypes.Integer64)
        });

        var jwt = new JwtSecurityToken(
            claims: allClaims,
            notBefore: now,
            expires: now.Add(lifetime),
            signingCredentials: credentials);
        return Handler.WriteToken(jwt);
    }

    private static ClaimsPrincipal Verify(Surface surface, string token)
    {
        var secret = AppConfig.Instance.For(surface).JwtSecret;
        var parameters = new TokenValidationParameters
        {
            ValidateIssuer = false,
            ValidateAudience = true,
            ValidAudience = surface.ToString(),
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(KeyBytes(secret)),
            ClockSkew = TimeSpan.FromMinutes(1)
        };
        Handler.ValidateToken(token, parameters, out _);
        // ValidateToken returns the principal; re-parse for our own claim access.
        var principal = Handler.ValidateToken(token, parameters, out _);
        return principal;
    }

    // Session ------------------------------------------------------------------

    public string SignSession(Surface surface, SessionTokenPayload payload)
        => Sign(surface, new[]
        {
            new Claim("sub", payload.Sub),
            new Claim("role", payload.Role),
            new Claim("tokenVersion", payload.TokenVersion.ToString(), ClaimValueTypes.Integer)
        }, TimeSpan.FromHours(12));

    public SessionTokenPayload VerifySession(Surface surface, string token)
    {
        var principal = Verify(surface, token);
        var sub = principal.FindFirst("sub")?.Value
            ?? throw new SecurityTokenException("missing sub");
        var role = principal.FindFirst("role")?.Value ?? "PLAYER";
        var tokenVersion = int.TryParse(principal.FindFirst("tokenVersion")?.Value, out var v) ? v : 0;
        return new SessionTokenPayload(sub, role, tokenVersion);
    }

    // Pending MFA ---------------------------------------------------------------

    public string SignPending(Surface surface, PendingMfaToken payload)
        => Sign(surface, new[]
        {
            new Claim("sub", payload.Sub),
            new Claim("purpose", payload.Purpose)
        }, TimeSpan.FromMinutes(5));

    public PendingMfaToken VerifyPending(Surface surface, string token)
    {
        var principal = Verify(surface, token);
        var sub = principal.FindFirst("sub")?.Value
            ?? throw new SecurityTokenException("missing sub");
        var purpose = principal.FindFirst("purpose")?.Value ?? "";
        return new PendingMfaToken(sub, purpose);
    }

    // OAuth pending ---------------------------------------------------------------

    public string SignOauthPending(OauthPendingToken payload)
        => Sign(Surface.GAMEPLAY, new[]
        {
            new Claim("state", payload.State),
            new Claim("nonce", payload.Nonce),
            new Claim("codeVerifier", payload.CodeVerifier),
            new Claim("purpose", payload.Purpose),
            new Claim("next", payload.Next ?? "")
        }, TimeSpan.FromMinutes(10));

    public OauthPendingToken VerifyOauthPending(string token)
    {
        var principal = Verify(Surface.GAMEPLAY, token);
        return new OauthPendingToken(
            principal.FindFirst("state")?.Value ?? "",
            principal.FindFirst("nonce")?.Value ?? "",
            principal.FindFirst("codeVerifier")?.Value ?? "",
            principal.FindFirst("purpose")?.Value ?? "",
            principal.FindFirst("next")?.Value is { Length: > 0 } next ? next : null);
    }

    // Invite ----------------------------------------------------------------------

    public string SignInvite(InviteToken payload)
        => Sign(Surface.PORTAL, new[]
        {
            new Claim("sub", payload.Sub),
            new Claim("tokenVersion", payload.TokenVersion.ToString(), ClaimValueTypes.Integer),
            new Claim("purpose", payload.Purpose)
        }, TimeSpan.FromDays(7));

    public InviteToken VerifyInvite(string token)
    {
        var principal = Verify(Surface.PORTAL, token);
        var sub = principal.FindFirst("sub")?.Value
            ?? throw new SecurityTokenException("missing sub");
        var tokenVersion = int.TryParse(principal.FindFirst("tokenVersion")?.Value, out var v) ? v : 0;
        return new InviteToken(sub, tokenVersion, principal.FindFirst("purpose")?.Value ?? "");
    }
}
