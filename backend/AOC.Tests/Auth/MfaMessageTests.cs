using Microsoft.EntityFrameworkCore;
using AOC.Api.Http;
using AOC.Api.Modules.Auth;
using AOC.Infrastructure.Auth;
using AOC.Infrastructure.Configuration;
using AOC.Infrastructure.Data;
using AOC.Infrastructure.Data.Entities;
using Xunit;

namespace AOC.Tests.Auth;

/// <summary>
/// Reconstructed port of the (uncommitted) tests/integration/auth.mfa-messages.test.ts.
/// The portal shows a different sentence per failure — these assert the exact
/// strings from auth/service.ts (they must never collapse into one message).
///
/// Requires POSTGRES_* + JWT secrets in the environment; skips otherwise.
/// </summary>
public class MfaMessageTests
{
    private static readonly SessionTokens Tokens = new();

    private static bool Ready => AuthTestDb.DatabaseReady();

    private static async Task<(UserEntity User, string? Password)> CreateUserAsync(
        AOCDbContext db, bool withPassword = true, bool disabled = false,
        bool totpEnabled = false)
    {
        var suffix = Guid.NewGuid().ToString("N")[..12];

        string? password = null;
        if (withPassword)
        {
            password = $"pw-{suffix}-long-enough";
        }

        var user = new UserEntity
        {
            Role = UserRole.PLAYER,
            Username = $"mfa-{suffix}",
            DisplayName = $"MFA Test {suffix}",
            PasswordHash = null,
            TotpSecret = null,
            TotpEnabledAt = null,
            DisabledAt = null
        };

        if (password is not null)
        {
            user.PasswordHash = await PasswordHasher.HashAsync(password);
        }
        if (totpEnabled)
        {
            user.TotpSecret = TotpService.NewTotpSecret();
            user.TotpEnabledAt = DateTime.UtcNow;
        }
        if (disabled)
        {
            user.DisabledAt = DateTime.UtcNow;
        }

        db.Users.Add(user);
        await db.SaveChangesAsync();
        return (user, password);
    }

    private static async Task RemoveAsync(AOCDbContext db, UserEntity user)
    {
        var tracked = await db.Users.FirstOrDefaultAsync(u => u.Id == user.Id);
        if (tracked is not null)
        {
            db.Users.Remove(tracked);
            await db.SaveChangesAsync();
        }
    }

    private static async Task<ApiException> CaptureAsync(Func<Task> fn)
    {
        try
        {
            await fn();
        }
        catch (ApiException ex)
        {
            return ex;
        }
        throw new InvalidOperationException("expected an ApiException");
    }

    // ---- startLogin ---------------------------------------------------------------

    [Fact]
    public async Task UnknownUsername_UsesTheGenericCredentialsSentence()
    {
        if (!Ready) return;
        await AuthTestDb.EnsureSchemaAsync();
        using var db = AuthTestDb.OpenDb();
        var auth = new AuthService(db, Tokens);

        var ex = await CaptureAsync(() =>
            auth.StartLoginAsync(Surface.PORTAL, $"ghost-{Guid.NewGuid():N}", "whatever"));

        Assert.Equal(401, ex.Status);
        Assert.Equal("Invalid username or password", ex.Message);
    }

    [Fact]
    public async Task WrongPassword_SharesTheSameSentenceAsUnknownUser()
    {
        if (!Ready) return;
        await AuthTestDb.EnsureSchemaAsync();
        using var db = AuthTestDb.OpenDb();
        var (user, password) = await CreateUserAsync(db);
        try
        {
            var auth = new AuthService(db, Tokens);
            var ex = await CaptureAsync(() =>
                auth.StartLoginAsync(Surface.PORTAL, user.Username, "definitely-wrong"));
            _ = password;

            // The two failure paths must never be distinguishable.
            Assert.Equal(401, ex.Status);
            Assert.Equal("Invalid username or password", ex.Message);
        }
        finally
        {
            await RemoveAsync(db, user);
        }
    }

    [Fact]
    public async Task UserWithoutPasswordHash_SharesTheSameSentence()
    {
        if (!Ready) return;
        await AuthTestDb.EnsureSchemaAsync();
        using var db = AuthTestDb.OpenDb();
        var (user, _) = await CreateUserAsync(db, withPassword: false);
        try
        {
            var auth = new AuthService(db, Tokens);
            var ex = await CaptureAsync(() =>
                auth.StartLoginAsync(Surface.PORTAL, user.Username, "anything"));

            Assert.Equal(401, ex.Status);
            Assert.Equal("Invalid username or password", ex.Message);
        }
        finally
        {
            await RemoveAsync(db, user);
        }
    }

    [Fact]
    public async Task DisabledAccount_IsForbiddenWithItsOwnSentence()
    {
        if (!Ready) return;
        await AuthTestDb.EnsureSchemaAsync();
        using var db = AuthTestDb.OpenDb();
        var (user, password) = await CreateUserAsync(db, disabled: true);
        try
        {
            var auth = new AuthService(db, Tokens);
            var ex = await CaptureAsync(() =>
                auth.StartLoginAsync(Surface.PORTAL, user.Username, password!));

            Assert.Equal(403, ex.Status);
            Assert.Equal("Account disabled", ex.Message);
        }
        finally
        {
            await RemoveAsync(db, user);
        }
    }

    [Fact]
    public async Task FirstLogin_ReturnsEnrollStateWithAnOtpauthUri()
    {
        if (!Ready) return;
        await AuthTestDb.EnsureSchemaAsync();
        using var db = AuthTestDb.OpenDb();
        var (user, password) = await CreateUserAsync(db, totpEnabled: false);
        try
        {
            var auth = new AuthService(db, Tokens);
            var result = await auth.StartLoginAsync(Surface.PORTAL, user.Username, password!);

            Assert.Equal("enroll", result.State);
            Assert.False(string.IsNullOrEmpty(result.PendingToken));
            Assert.StartsWith("otpauth://totp/", result.OtpauthUri);

            // The fresh secret was persisted for the confirm step.
            var reloaded = await db.Users.AsNoTracking().FirstAsync(u => u.Id == user.Id);
            Assert.False(string.IsNullOrEmpty(reloaded.TotpSecret));
        }
        finally
        {
            await RemoveAsync(db, user);
        }
    }

    [Fact]
    public async Task EnrolledLogin_ReturnsMfaStateWithoutAnOtpauthUri()
    {
        if (!Ready) return;
        await AuthTestDb.EnsureSchemaAsync();
        using var db = AuthTestDb.OpenDb();
        var (user, password) = await CreateUserAsync(db, totpEnabled: true);
        try
        {
            var auth = new AuthService(db, Tokens);
            var result = await auth.StartLoginAsync(Surface.PORTAL, user.Username, password!);

            Assert.Equal("mfa", result.State);
            Assert.False(string.IsNullOrEmpty(result.PendingToken));
            Assert.Null(result.OtpauthUri);
        }
        finally
        {
            await RemoveAsync(db, user);
        }
    }

    // ---- finishMfa ----------------------------------------------------------------

    [Fact]
    public async Task GarbagePendingToken_SaysTheLoginSessionExpired()
    {
        if (!Ready) return;
        await AuthTestDb.EnsureSchemaAsync();
        using var db = AuthTestDb.OpenDb();
        var auth = new AuthService(db, Tokens);

        var ex = await CaptureAsync(() =>
            auth.FinishMfaAsync(Surface.PORTAL, "not-a-token", "123456"));

        Assert.Equal(401, ex.Status);
        Assert.Equal("Login session expired, start again", ex.Message);
    }

    [Fact]
    public async Task WrongPurposeToken_SaysTheLoginSessionIsInvalid()
    {
        if (!Ready) return;
        await AuthTestDb.EnsureSchemaAsync();
        using var db = AuthTestDb.OpenDb();
        var auth = new AuthService(db, Tokens);

        var wrongPurpose = Tokens.SignPending(Surface.PORTAL,
            new PendingMfaToken(Guid.NewGuid().ToString(), "something-else"));
        var ex = await CaptureAsync(() =>
            auth.FinishMfaAsync(Surface.PORTAL, wrongPurpose, "123456"));

        Assert.Equal(401, ex.Status);
        Assert.Equal("Invalid login session", ex.Message);
    }

    [Fact]
    public async Task MismatchedCode_SaysThatCodeDidntMatch()
    {
        if (!Ready) return;
        await AuthTestDb.EnsureSchemaAsync();
        using var db = AuthTestDb.OpenDb();
        var (user, password) = await CreateUserAsync(db, totpEnabled: true);
        try
        {
            var auth = new AuthService(db, Tokens);
            var pending = (await auth.StartLoginAsync(
                Surface.PORTAL, user.Username, password!)).PendingToken;

            // A code for a DIFFERENT secret is deterministically wrong.
            var wrongCode = new OtpNet.Totp(
                System.Security.Cryptography.RandomNumberGenerator.GetBytes(20)).ComputeTotp();

            var ex = await CaptureAsync(() =>
                auth.FinishMfaAsync(Surface.PORTAL, pending, wrongCode));

            Assert.Equal(401, ex.Status);
            Assert.Equal("That code didn't match", ex.Message);
        }
        finally
        {
            await RemoveAsync(db, user);
        }
    }

    [Fact]
    public async Task ReusedCode_SaysItWasAlreadyUsed()
    {
        if (!Ready) return;
        await AuthTestDb.EnsureSchemaAsync();
        using var db = AuthTestDb.OpenDb();
        var (user, password) = await CreateUserAsync(db, totpEnabled: true);
        try
        {
            var auth = new AuthService(db, Tokens);
            var pending = (await auth.StartLoginAsync(
                Surface.PORTAL, user.Username, password!)).PendingToken;

            var reloaded = await db.Users.AsNoTracking().FirstAsync(u => u.Id == user.Id);
            var code = CurrentCode(reloaded.TotpSecret!);

            // First use succeeds and records the time step…
            var token = await auth.FinishMfaAsync(Surface.PORTAL, pending, code);
            Assert.False(string.IsNullOrEmpty(token));

            // …so the same code now reports "reused", not "didn't match".
            var ex = await CaptureAsync(() =>
                auth.FinishMfaAsync(Surface.PORTAL, pending, code));

            Assert.Equal(401, ex.Status);
            Assert.Equal("This code was already used", ex.Message);
        }
        finally
        {
            await RemoveAsync(db, user);
        }
    }

    [Fact]
    public async Task ValidCode_ReturnsASessionToken()
    {
        if (!Ready) return;
        await AuthTestDb.EnsureSchemaAsync();
        using var db = AuthTestDb.OpenDb();
        var (user, password) = await CreateUserAsync(db, totpEnabled: true);
        try
        {
            var auth = new AuthService(db, Tokens);
            var pending = (await auth.StartLoginAsync(
                Surface.PORTAL, user.Username, password!)).PendingToken;

            var reloaded = await db.Users.AsNoTracking().FirstAsync(u => u.Id == user.Id);
            var token = await auth.FinishMfaAsync(
                Surface.PORTAL, pending, CurrentCode(reloaded.TotpSecret!));

            // JWT shape: three dot-separated segments.
            Assert.Equal(3, token.Split('.').Length);
        }
        finally
        {
            await RemoveAsync(db, user);
        }
    }

    private static string CurrentCode(string secret)
        => new OtpNet.Totp(OtpNet.Base32Encoding.ToBytes(secret)).ComputeTotp();
}
