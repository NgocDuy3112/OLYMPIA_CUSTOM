using System.Security.Cryptography;
using OtpNet;

namespace AOC.Infrastructure.Auth;

/// <summary>
/// Port of auth/totp.ts — otplib-compatible TOTP (SHA1, 6 digits, 30 s step,
/// ±30 s window = ±1 step) over the same base32 secrets.
/// </summary>
public static class TotpService
{
    private const int EpochToleranceSteps = 1; // 30 s tolerance == one step

    public static string NewTotpSecret()
        => Base32Encoding.ToString(RandomNumberGenerator.GetBytes(20));

    public static string OtpauthUri(string secret, string accountName)
    {
        var issuer = Uri.EscapeDataString("AOC");
        var label = $"{issuer}:{Uri.EscapeDataString(accountName)}";
        return $"otpauth://totp/{label}?secret={Uri.EscapeDataString(secret)}&issuer={issuer}";
    }

    public static TotpVerification VerifyTotpCode(string secret, string code, int? lastUsedStep)
    {
        if (code.Length != 6 || !code.All(char.IsDigit))
            return TotpVerification.Invalid();

        byte[] key;
        try
        {
            key = Base32Encoding.ToBytes(secret);
        }
        catch (FormatException)
        {
            return TotpVerification.Invalid();
        }

        var totp = new Totp(key);
        if (!totp.VerifyTotp(code, out var timeStepUsed, new VerificationWindow(previous: EpochToleranceSteps, future: EpochToleranceSteps)))
        {
            return TotpVerification.Invalid();
        }

        var step = (int)timeStepUsed;
        if (lastUsedStep is { } last && step <= last)
            return TotpVerification.Reused();

        return TotpVerification.Success(step);
    }
}

public sealed class TotpVerification
{
    public bool Ok { get; private init; }
    public string Reason { get; private init; } = "invalid"; // invalid | reused
    public int Step { get; private init; }

    public static TotpVerification Success(int step) => new() { Ok = true, Step = step };
    public static TotpVerification Invalid() => new();
    public static TotpVerification Reused() => new() { Reason = "reused" };
}
