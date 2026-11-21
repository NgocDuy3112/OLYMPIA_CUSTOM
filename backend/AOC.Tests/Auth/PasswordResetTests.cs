using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using AOC.Api.Http;
using AOC.Api.Modules.Auth;
using AOC.Infrastructure.Auth;
using AOC.Infrastructure.Data;
using AOC.Infrastructure.Data.Entities;
using AOC.Infrastructure.Email;

namespace AOC.Tests.Auth;

public class PasswordResetTests
{
    private sealed class RecordingEmail : IEmailService
    {
        public List<(string To, string Subject, string HtmlBody)> Sent { get; } = [];

        public Task SendAsync(string to, string subject, string htmlBody, CancellationToken cancellationToken = default)
        {
            Sent.Add((to, subject, htmlBody));
            return Task.CompletedTask;
        }
    }

    private static async Task<(UserEntity User, string Password)> CreateUserAsync(AOCDbContext db, string email)
    {
        var suffix = Guid.NewGuid().ToString("N")[..12];
        var password = $"old-password-{suffix}-long";
        var user = new UserEntity
        {
            Role = UserRole.PLAYER,
            Username = $"reset-{suffix}",
            Email = email,
            DisplayName = $"Reset Test {suffix}",
            PasswordHash = await PasswordHasher.HashAsync(password)
        };
        db.Users.Add(user);
        await db.SaveChangesAsync();
        return (user, password);
    }

    private static async Task RemoveAsync(AOCDbContext db, UserEntity user)
    {
        var rows = await db.PasswordResetCodes
            .Where(r => r.UserId == user.Id)
            .ToListAsync();
        db.PasswordResetCodes.RemoveRange(rows);
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

    private static string ParseCode(string text)
    {
        var match = Regex.Match(text, "[0-9]{8}");
        Assert.True(match.Success);
        return match.Value;
    }

    private static string WrongCode(string code)
    {
        if (code == "00000000") return "00000001";
        return "00000000";
    }

    [DbFact]
    public async Task ForgotPassword_UnknownEmail_SendsNothing()
    {
        await AuthTestDb.EnsureSchemaAsync();
        using var db = AuthTestDb.OpenDb();
        var mail = new RecordingEmail();
        var service = new PasswordResetService(db, mail);

        await service.RequestResetAsync($"ghost-{Guid.NewGuid():N}@example.com");

        Assert.Empty(mail.Sent);
    }

    [DbFact]
    public async Task ForgotPassword_KnownEmail_SendsOneEmailWithVerifiableCode()
    {
        await AuthTestDb.EnsureSchemaAsync();
        using var db = AuthTestDb.OpenDb();
        var email = $"reset-{Guid.NewGuid():N}@example.com";
        var (user, _) = await CreateUserAsync(db, email);
        try
        {
            var mail = new RecordingEmail();
            var service = new PasswordResetService(db, mail);

            await service.RequestResetAsync(email);

            var sent = Assert.Single(mail.Sent);
            Assert.Equal(email, sent.To);
            var code = ParseCode(sent.Subject + "\n" + sent.HtmlBody);
            Assert.Matches("^[0-9]{8}$", code);

            var newPassword = $"new-password-{Guid.NewGuid():N}-long";
            await service.ResetPasswordAsync(email, code, newPassword);
            var reloaded = await db.Users.AsNoTracking().FirstAsync(u => u.Id == user.Id);
            Assert.True(await PasswordHasher.VerifyAsync(reloaded.PasswordHash!, newPassword));
        }
        finally
        {
            await RemoveAsync(db, user);
        }
    }

    [DbFact]
    public async Task ResetPassword_CorrectCode_RotatesPasswordAndBumpsTokenVersion()
    {
        await AuthTestDb.EnsureSchemaAsync();
        using var db = AuthTestDb.OpenDb();
        var email = $"reset-{Guid.NewGuid():N}@example.com";
        var (user, oldPassword) = await CreateUserAsync(db, email);
        try
        {
            var before = (await db.Users.AsNoTracking().FirstAsync(u => u.Id == user.Id)).TokenVersion;
            var mail = new RecordingEmail();
            var service = new PasswordResetService(db, mail);

            await service.RequestResetAsync(email);
            var code = ParseCode(mail.Sent[0].Subject + "\n" + mail.Sent[0].HtmlBody);
            var newPassword = $"brand-new-{Guid.NewGuid():N}-long";
            await service.ResetPasswordAsync(email, code, newPassword);

            var after = await db.Users.AsNoTracking().FirstAsync(u => u.Id == user.Id);
            Assert.False(await PasswordHasher.VerifyAsync(after.PasswordHash!, oldPassword));
            Assert.True(await PasswordHasher.VerifyAsync(after.PasswordHash!, newPassword));
            Assert.Equal(before + 1, after.TokenVersion);
        }
        finally
        {
            await RemoveAsync(db, user);
        }
    }

    [DbFact]
    public async Task ResetPassword_WrongCode_FailsWithTheGenericMessage()
    {
        await AuthTestDb.EnsureSchemaAsync();
        using var db = AuthTestDb.OpenDb();
        var email = $"reset-{Guid.NewGuid():N}@example.com";
        var (user, _) = await CreateUserAsync(db, email);
        try
        {
            var mail = new RecordingEmail();
            var service = new PasswordResetService(db, mail);

            await service.RequestResetAsync(email);
            var code = ParseCode(mail.Sent[0].Subject + "\n" + mail.Sent[0].HtmlBody);

            var ex = await CaptureAsync(() =>
                service.ResetPasswordAsync(email, WrongCode(code), $"new-password-{Guid.NewGuid():N}-long"));

            Assert.Equal(400, ex.Status);
            Assert.Equal("Mã không hợp lệ hoặc đã hết hạn.", ex.Message);
        }
        finally
        {
            await RemoveAsync(db, user);
        }
    }

    [DbFact]
    public async Task ResetPassword_ExpiredCode_FailsWithTheGenericMessage()
    {
        await AuthTestDb.EnsureSchemaAsync();
        using var db = AuthTestDb.OpenDb();
        var email = $"reset-{Guid.NewGuid():N}@example.com";
        var (user, _) = await CreateUserAsync(db, email);
        try
        {
            var mail = new RecordingEmail();
            var service = new PasswordResetService(db, mail);

            await service.RequestResetAsync(email);
            var code = ParseCode(mail.Sent[0].Subject + "\n" + mail.Sent[0].HtmlBody);

            var row = await db.PasswordResetCodes
                .Where(r => r.UserId == user.Id)
                .OrderByDescending(r => r.CreatedAt)
                .FirstAsync();
            row.ExpiresAt = DateTime.UtcNow.AddMinutes(-1);
            await db.SaveChangesAsync();

            var ex = await CaptureAsync(() =>
                service.ResetPasswordAsync(email, code, $"new-password-{Guid.NewGuid():N}-long"));

            Assert.Equal(400, ex.Status);
            Assert.Equal("Mã không hợp lệ hoặc đã hết hạn.", ex.Message);
        }
        finally
        {
            await RemoveAsync(db, user);
        }
    }

    [DbFact]
    public async Task ResetPassword_UsedCode_CannotBeReused()
    {
        await AuthTestDb.EnsureSchemaAsync();
        using var db = AuthTestDb.OpenDb();
        var email = $"reset-{Guid.NewGuid():N}@example.com";
        var (user, _) = await CreateUserAsync(db, email);
        try
        {
            var mail = new RecordingEmail();
            var service = new PasswordResetService(db, mail);

            await service.RequestResetAsync(email);
            var code = ParseCode(mail.Sent[0].Subject + "\n" + mail.Sent[0].HtmlBody);
            await service.ResetPasswordAsync(email, code, $"first-new-{Guid.NewGuid():N}-long");

            var ex = await CaptureAsync(() =>
                service.ResetPasswordAsync(email, code, $"second-new-{Guid.NewGuid():N}-long"));

            Assert.Equal(400, ex.Status);
            Assert.Equal("Mã không hợp lệ hoặc đã hết hạn.", ex.Message);
        }
        finally
        {
            await RemoveAsync(db, user);
        }
    }

    [DbFact]
    public async Task ResetPassword_SixthFailedAttempt_InvalidatesTheCode()
    {
        await AuthTestDb.EnsureSchemaAsync();
        using var db = AuthTestDb.OpenDb();
        var email = $"reset-{Guid.NewGuid():N}@example.com";
        var (user, _) = await CreateUserAsync(db, email);
        try
        {
            var mail = new RecordingEmail();
            var service = new PasswordResetService(db, mail);

            await service.RequestResetAsync(email);
            var code = ParseCode(mail.Sent[0].Subject + "\n" + mail.Sent[0].HtmlBody);
            var wrong = WrongCode(code);
            var newPassword = $"new-password-{Guid.NewGuid():N}-long";

            for (var i = 0; i < 5; i++)
            {
                var attempt = await CaptureAsync(() => service.ResetPasswordAsync(email, wrong, newPassword));
                Assert.Equal(400, attempt.Status);
                Assert.Equal("Mã không hợp lệ hoặc đã hết hạn.", attempt.Message);
            }

            var sixth = await CaptureAsync(() => service.ResetPasswordAsync(email, wrong, newPassword));
            Assert.Equal(400, sixth.Status);
            Assert.Equal("Mã không hợp lệ hoặc đã hết hạn.", sixth.Message);

            var row = await db.PasswordResetCodes
                .Where(r => r.UserId == user.Id)
                .OrderByDescending(r => r.CreatedAt)
                .FirstOrDefaultAsync();
            Assert.NotNull(row);
            Assert.NotNull(row!.UsedAt);

            var correct = await CaptureAsync(() => service.ResetPasswordAsync(email, code, newPassword));
            Assert.Equal(400, correct.Status);
            Assert.Equal("Mã không hợp lệ hoặc đã hết hạn.", correct.Message);
        }
        finally
        {
            await RemoveAsync(db, user);
        }
    }

    [DbFact]
    public async Task ForgotPassword_Twice_ReusesExistingCodeAndStillWorks()
    {
        await AuthTestDb.EnsureSchemaAsync();
        using var db = AuthTestDb.OpenDb();
        var email = $"reset-{Guid.NewGuid():N}@example.com";
        var (user, _) = await CreateUserAsync(db, email);
        try
        {
            var mail = new RecordingEmail();
            var service = new PasswordResetService(db, mail);

            await service.RequestResetAsync(email);
            var code = ParseCode(mail.Sent[0].Subject + "\n" + mail.Sent[0].HtmlBody);

            await service.RequestResetAsync(email);

            Assert.Single(mail.Sent);
            var rows = await db.PasswordResetCodes
                .Where(r => r.UserId == user.Id)
                .ToListAsync();
            Assert.Single(rows);

            var freshPassword = $"fresh-new-{Guid.NewGuid():N}-long";
            await service.ResetPasswordAsync(email, code, freshPassword);
            var reloaded = await db.Users.AsNoTracking().FirstAsync(u => u.Id == user.Id);
            Assert.True(await PasswordHasher.VerifyAsync(reloaded.PasswordHash!, freshPassword));
        }
        finally
        {
            await RemoveAsync(db, user);
        }
    }

    [DbFact]
    public async Task RequestReset_AfterMaxTotalFailures_StopsIssuingCodes()
    {
        await AuthTestDb.EnsureSchemaAsync();
        using var db = AuthTestDb.OpenDb();
        var email = $"reset-{Guid.NewGuid():N}@example.com";
        var (user, _) = await CreateUserAsync(db, email);
        try
        {
            var mail = new RecordingEmail();
            var service = new PasswordResetService(db, mail);

            await service.RequestResetAsync(email);
            var code = ParseCode(mail.Sent[0].Subject + "\n" + mail.Sent[0].HtmlBody);
            var wrong = WrongCode(code);
            var newPassword = $"new-password-{Guid.NewGuid():N}-long";

            for (var i = 0; i < 5; i++)
            {
                var attempt = await CaptureAsync(() => service.ResetPasswordAsync(email, wrong, newPassword));
                Assert.Equal(400, attempt.Status);
            }

            await service.RequestResetAsync(email);

            Assert.Single(mail.Sent);
            var rows = await db.PasswordResetCodes
                .Where(r => r.UserId == user.Id)
                .ToListAsync();
            Assert.Single(rows);
        }
        finally
        {
            await RemoveAsync(db, user);
        }
    }
}
