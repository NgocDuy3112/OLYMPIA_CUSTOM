using System.Security.Cryptography;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using AOC.Api.Http;
using AOC.Infrastructure.Auth;
using AOC.Infrastructure.Data;
using AOC.Infrastructure.Data.Entities;
using AOC.Infrastructure.Email;

namespace AOC.Api.Modules.Auth;

public sealed class PasswordResetService(AOCDbContext db, IEmailService emailSender)
{
    private const int PasswordMin = 8;
    private const int MaxAttempts = 5;
    private const int CodeMinutes = 10;

    private static readonly Regex EmailPattern =
        new("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", RegexOptions.Compiled);
    private static readonly Regex CodePattern =
        new("^[0-9]{8}$", RegexOptions.Compiled);

    public async Task RequestResetAsync(string email, CancellationToken cancellationToken = default)
    {
        var normalized = NormalizeEmail(email);
        var user = await db.Users.AsNoTracking().FirstOrDefaultAsync(
            u => u.Email != null && u.Email.ToLower() == normalized, cancellationToken);
        if (user is null) return;
        if (user.PasswordHash is null) return;

        var now = DateTime.UtcNow;
        var code = RandomNumberGenerator.GetInt32(0, 100000000).ToString("D8");
        var codeHash = await PasswordHasher.HashAsync(code);

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        await db.PasswordResetCodes
            .Where(r => r.UserId == user.Id && r.UsedAt == null)
            .ExecuteUpdateAsync(setters => setters.SetProperty(r => r.UsedAt, now), cancellationToken);
        await db.PasswordResetCodes
            .Where(r => r.UserId == user.Id && (r.UsedAt != null || r.ExpiresAt <= now))
            .ExecuteDeleteAsync(cancellationToken);
        db.PasswordResetCodes.Add(new PasswordResetCodeEntity
        {
            UserId = user.Id,
            CodeHash = codeHash,
            Salt = "",
            ExpiresAt = now.AddMinutes(CodeMinutes),
            UsedAt = null,
            Attempts = 0,
            CreatedAt = now
        });
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        var subject = "Mã đặt lại mật khẩu AOC " + code;
        var htmlBody = "<p>Mã đặt lại mật khẩu của bạn là: <b>" + code + "</b></p>"
            + "<p>Mã có hiệu lực trong 10 phút.</p>";
        await emailSender.SendAsync(user.Email!, subject, htmlBody, cancellationToken);
    }

    public async Task ResetPasswordAsync(
        string email, string code, string newPassword, CancellationToken cancellationToken = default)
    {
        var normalized = NormalizeEmail(email);
        if (!CodePattern.IsMatch(code)) throw InvalidCode();
        if (newPassword.Length < PasswordMin)
            throw ApiException.BadRequest($"Mật khẩu cần ít nhất {PasswordMin} ký tự.");

        var now = DateTime.UtcNow;
        var user = await db.Users.AsNoTracking().FirstOrDefaultAsync(
            u => u.Email != null && u.Email.ToLower() == normalized, cancellationToken);
        if (user is null) throw InvalidCode();

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        var rowId = await db.Database
            .SqlQueryRaw<Guid>(
                "SELECT id AS \"Value\" FROM password_reset_codes " +
                "WHERE user_id = {0} AND used_at IS NULL AND expires_at > {1} FOR UPDATE",
                user.Id, now)
            .FirstOrDefaultAsync(cancellationToken);
        if (rowId == Guid.Empty) throw InvalidCode();

        var row = await db.PasswordResetCodes.AsNoTracking()
            .FirstAsync(r => r.Id == rowId, cancellationToken);
        var verified = await PasswordHasher.VerifyAsync(row.CodeHash, code);
        var attempts = row.Attempts + 1;

        if (!verified)
        {
            var exhausted = attempts > MaxAttempts;
            DateTime? usedAt = exhausted ? now : row.UsedAt;
            await db.PasswordResetCodes
                .Where(r => r.Id == rowId)
                .ExecuteUpdateAsync(setters => setters
                    .SetProperty(r => r.Attempts, attempts)
                    .SetProperty(r => r.UsedAt, usedAt), cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            throw InvalidCode();
        }

        var passwordHash = await PasswordHasher.HashAsync(newPassword);
        await db.Users
            .Where(u => u.Id == user.Id)
            .ExecuteUpdateAsync(setters => setters
                .SetProperty(u => u.TokenVersion, u => u.TokenVersion + 1)
                .SetProperty(u => u.PasswordHash, passwordHash)
                .SetProperty(u => u.MustChangePassword, false)
                .SetProperty(u => u.UpdatedAt, now), cancellationToken);
        await db.PasswordResetCodes
            .Where(r => r.UserId == user.Id)
            .ExecuteDeleteAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
    }

    private static string NormalizeEmail(string email)
    {
        var normalized = email.Trim().ToLowerInvariant();
        if (normalized.Length < 3) throw ApiException.BadRequest("Email không hợp lệ.");
        if (!EmailPattern.IsMatch(normalized)) throw ApiException.BadRequest("Email không hợp lệ.");
        return normalized;
    }

    private static ApiException InvalidCode()
        => ApiException.BadRequest("Mã không hợp lệ hoặc đã hết hạn.");
}
