using System.Security.Cryptography;
using System.Text;
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
        var user = await db.Users.FirstOrDefaultAsync(
            u => u.Email != null && u.Email.ToLower() == normalized, cancellationToken);
        if (user is null) return;
        if (user.PasswordHash is null) return;

        var now = DateTime.UtcNow;
        var rows = await db.PasswordResetCodes
            .Where(r => r.UserId == user.Id)
            .ToListAsync(cancellationToken);

        if (rows.Sum(r => r.Attempts) >= MaxAttempts) return;

        if (rows.Any(r => r.UsedAt == null && r.ExpiresAt > now)) return;

        var code = RandomNumberGenerator.GetInt32(0, 100000000).ToString("D8");
        var salt = Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();

        db.PasswordResetCodes.Add(new PasswordResetCodeEntity
        {
            UserId = user.Id,
            CodeHash = ComputeHash(salt, code),
            Salt = salt,
            ExpiresAt = now.AddMinutes(CodeMinutes),
            UsedAt = null,
            Attempts = 0,
            CreatedAt = now
        });
        await db.SaveChangesAsync(cancellationToken);

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
        var user = await db.Users.FirstOrDefaultAsync(
            u => u.Email != null && u.Email.ToLower() == normalized, cancellationToken);
        if (user is null) throw InvalidCode();

        var rows = await db.PasswordResetCodes
            .Where(r => r.UserId == user.Id)
            .ToListAsync(cancellationToken);
        var row = rows
            .Where(r => r.UsedAt == null && r.ExpiresAt > now)
            .OrderByDescending(r => r.CreatedAt)
            .FirstOrDefault();
        if (row is null) throw InvalidCode();

        row.Attempts = row.Attempts + 1;
        if (rows.Sum(r => r.Attempts) > MaxAttempts)
        {
            row.UsedAt = now;
            await db.SaveChangesAsync(cancellationToken);
            throw InvalidCode();
        }

        var candidate = ComputeHash(row.Salt, code);
        var candidateBytes = Encoding.UTF8.GetBytes(candidate);
        var expectedBytes = Encoding.UTF8.GetBytes(row.CodeHash);
        var match = CryptographicOperations.FixedTimeEquals(candidateBytes, expectedBytes);
        if (!match)
        {
            await db.SaveChangesAsync(cancellationToken);
            throw InvalidCode();
        }

        row.UsedAt = now;
        user.PasswordHash = await PasswordHasher.HashAsync(newPassword);
        user.TokenVersion = user.TokenVersion + 1;
        user.MustChangePassword = false;
        user.UpdatedAt = now;
        db.PasswordResetCodes.RemoveRange(rows);
        await db.SaveChangesAsync(cancellationToken);
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

    private static string ComputeHash(string salt, string code)
    {
        var bytes = Encoding.UTF8.GetBytes(salt + ":" + code);
        return Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
    }
}
