using AOC.Api.Modules.Live;
using Xunit;

namespace AOC.Tests.Modules;

public class LiveDeadlineTests
{
    private const string ClockStartedAt = "2026-01-01T12:00:00.000Z";

    [Fact]
    public void A_finite_offset_lands_that_many_seconds_after_the_clock()
        => Assert.Equal("2026-01-01T12:00:45.000Z", LiveView.PlusSeconds(ClockStartedAt, 45));

    [Fact]
    public void A_zero_offset_keeps_the_clock()
        => Assert.Equal(ClockStartedAt, LiveView.PlusSeconds(ClockStartedAt, 0));

    [Fact]
    public void A_negative_offset_is_refused()
        => Assert.Throws<LiveStateError>(() => LiveView.PlusSeconds(ClockStartedAt, -1));

    [Theory]
    [InlineData(double.NaN)]
    [InlineData(double.PositiveInfinity)]
    [InlineData(double.MaxValue)]
    [InlineData(86_401)]
    public void A_non_finite_or_out_of_bound_offset_is_refused(double seconds)
        => Assert.Throws<LiveStateError>(() => LiveView.PlusSeconds(ClockStartedAt, seconds));
}
