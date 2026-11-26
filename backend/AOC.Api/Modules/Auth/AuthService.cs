using Microsoft.EntityFrameworkCore;
using AOC.Api.Http;
using AOC.Infrastructure.Auth;
using AOC.Infrastructure.Configuration;
using AOC.Infrastructure.Data;
using AOC.Infrastructure.Data.Entities;

namespace AOC.Api.Modules.Auth;

public sealed class AuthService(AOCDbContext db, SessionTokens tokens)
{
    public sealed record LoginResult(string State, string? PendingToken, string? OtpauthUri);

    public async Task<LoginResult> StartLoginAsync(Surface surface, string username, string password)
    {
        var user = await db.Users.FirstOrDefaultAsync(u => u.Username == username);

        UserEntity Invalid() => throw ApiException.Unauthorized("Invalid username or password");

        if (user is null || user.PasswordHash is null) Invalid();
        if (!await PasswordHasher.VerifyAsync(user.PasswordHash!, password)) Invalid();
        if (user.DisabledAt is not null) throw ApiException.Forbidden("Account disabled");

        var pendingToken = tokens.SignPending(surface, new PendingMfaToken(user.Id.ToString(), "mfa"));

        if (user.TotpEnabledAt is null)
        {
            var secret = TotpService.NewTotpSecret();
            user.TotpSecret = secret;
            user.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();

            return new LoginResult("enroll", pendingToken, TotpService.OtpauthUri(secret, username));
        }

        return new LoginResult("mfa", pendingToken, null);
    }

    public async Task<string> FinishMfaAsync(Surface surface, string pendingToken, string code)
    {
        PendingMfaToken pending;
        try
        {
            pending = tokens.VerifyPending(surface, pendingToken);
        }
        catch
        {
            throw ApiException.Unauthorized("Login session expired, start again");
        }
        if (pending.Purpose != "mfa")
            throw ApiException.Unauthorized("Invalid login session");

        if (!Guid.TryParse(pending.Sub, out var userId))
            throw ApiException.Unauthorized("Login session expired, start again");

        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == userId);
        if (user is null || user.TotpSecret is null)
            throw ApiException.Unauthorized("Login session expired, start again");
        if (user.DisabledAt is not null) throw ApiException.Forbidden("Account disabled");

        var verification = TotpService.VerifyTotpCode(user.TotpSecret, code, user.TotpLastUsedStep);
        if (!verification.Ok)
        {
            throw ApiException.Unauthorized(
                verification.Reason == "reused"
                    ? "This code was already used"
                    : "That code didn't match");
        }

        user.TotpLastUsedStep = verification.Step;
        if (user.TotpEnabledAt is null) user.TotpEnabledAt = DateTime.UtcNow;
        user.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        return tokens.SignSession(surface,
            new SessionTokenPayload(user.Id.ToString(), user.Role.ToString(), user.TokenVersion));
    }
}
