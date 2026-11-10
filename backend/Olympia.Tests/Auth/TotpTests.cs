using OtpNet;
using Olympia.Infrastructure.Auth;
using Xunit;

namespace Olympia.Tests.Auth;

/// <summary>
/// Reconstructed port of the (uncommitted) tests/unit/auth/totp.test.ts,
/// covering auth/totp.ts semantics: base32 secrets, otpauth URIs, the ±30 s
/// (±1 step) window, and the distinct invalid/reused outcomes.
/// </summary>
public class TotpTests
{
    private static string CodeFor(string secret, DateTime at)
        => new Totp(Base32Encoding.ToBytes(secret)).ComputeTotp(at);

    private static string CodeFor(string secret)
        => new Totp(Base32Encoding.ToBytes(secret)).ComputeTotp();

    [Fact]
    public void NewSecret_AFreshCodeVerifies()
    {
        var secret = TotpService.NewTotpSecret();
        var verification = TotpService.VerifyTotpCode(secret, CodeFor(secret), null);

        Assert.True(verification.Ok);
        Assert.True(verification.Step >= 0);
    }

    [Fact]
    public void NewSecret_IsBase32ThatRoundTrips()
    {
        var secret = TotpService.NewTotpSecret();
        var key = Base32Encoding.ToBytes(secret);
        Assert.NotEmpty(key);
        // …and the secret is stable enough to reproduce the same code.
        Assert.Equal(CodeFor(secret), CodeFor(secret));
    }

    [Fact]
    public void Window_AcceptsThePreviousStep()
    {
        var secret = TotpService.NewTotpSecret();
        var previousStepCode = CodeFor(secret, DateTime.UtcNow.AddSeconds(-30));

        var verification = TotpService.VerifyTotpCode(secret, previousStepCode, null);
        Assert.True(verification.Ok);
    }

    [Fact]
    public void Window_RejectsTwoStepsAgo()
    {
        var secret = TotpService.NewTotpSecret();
        var twoStepsAgo = CodeFor(secret, DateTime.UtcNow.AddSeconds(-60));

        var verification = TotpService.VerifyTotpCode(secret, twoStepsAgo, null);
        Assert.False(verification.Ok);
        Assert.Equal("invalid", verification.Reason);
    }

    [Fact]
    public void WrongCode_FromAnotherSecretIsRejected()
    {
        var secret = TotpService.NewTotpSecret();
        var otherSecret = TotpService.NewTotpSecret();

        var verification = TotpService.VerifyTotpCode(secret, CodeFor(otherSecret), null);
        Assert.False(verification.Ok);
        Assert.Equal("invalid", verification.Reason);
    }

    [Theory]
    [InlineData("")]
    [InlineData("12345")]
    [InlineData("1234567")]
    [InlineData("abcdef")]
    [InlineData("12 456")]
    public void MalformedCodesAreRejectedWithoutThrowing(string code)
    {
        var secret = TotpService.NewTotpSecret();
        var verification = TotpService.VerifyTotpCode(secret, code, null);

        Assert.False(verification.Ok);
        Assert.Equal("invalid", verification.Reason);
    }

    [Fact]
    public void ReusedStep_IsReportedDistinctlyFromMismatch()
    {
        var secret = TotpService.NewTotpSecret();
        var code = CodeFor(secret);

        var first = TotpService.VerifyTotpCode(secret, code, null);
        Assert.True(first.Ok);

        // Same step again → "reused" (the portal shows a different sentence).
        var reused = TotpService.VerifyTotpCode(secret, code, first.Step);
        Assert.False(reused.Ok);
        Assert.Equal("reused", reused.Reason);

        // An older lastUsedStep still accepts the current code.
        var older = TotpService.VerifyTotpCode(secret, code, first.Step - 1);
        Assert.True(older.Ok);
    }

    [Fact]
    public void OtpauthUri_CarriesIssuerLabelAndSecret()
    {
        var secret = TotpService.NewTotpSecret();
        var uri = TotpService.OtpauthUri(secret, "player@example.com");

        Assert.StartsWith("otpauth://totp/Olympia:", uri);
        Assert.Contains($"secret={Uri.EscapeDataString(secret)}", uri);
        Assert.Contains("issuer=Olympia", uri);
        Assert.Contains(Uri.EscapeDataString("player@example.com"), uri);
    }
}
