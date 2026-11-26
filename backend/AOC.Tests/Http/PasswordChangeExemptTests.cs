using AOC.Api.Http;
using Xunit;

namespace AOC.Tests.Http;

public class PasswordChangeExemptTests
{
    [Theory]
    [InlineData("/api/auth/me")]
    [InlineData("/api/auth/logout")]
    [InlineData("/api/auth/change-password")]
    [InlineData("/api/auth/me/")]
    [InlineData("/api/auth/change-password/")]
    [InlineData("/api/auth/me/profile")]
    public void Exempt_paths_stay_exempt_below_the_policy_root(string path)
        => Assert.True(Guards.IsPasswordChangeExempt(path));

    [Theory]
    [InlineData("/api/auth/me-other")]
    [InlineData("/api/auth/change-password-reset")]
    [InlineData("/portal/tournaments/abc")]
    [InlineData("/api/auth")]
    public void Exempt_prefix_must_end_on_a_segment_boundary(string path)
        => Assert.False(Guards.IsPasswordChangeExempt(path));
}
