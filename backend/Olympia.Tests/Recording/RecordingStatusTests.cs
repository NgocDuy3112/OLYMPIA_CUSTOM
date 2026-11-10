using Livekit.Server.Sdk.Dotnet;
using Olympia.Api.Modules.Recording;
using Xunit;

namespace Olympia.Tests.Recording;

/// <summary>
/// Reconstructed port of the (uncommitted) tests/unit/recording/status.test.ts —
/// terminal-state folding and status labels for egress jobs.
/// </summary>
public class RecordingStatusTests
{
    [Theory]
    [InlineData(EgressStatus.EgressComplete, true)]
    [InlineData(EgressStatus.EgressFailed, true)]
    [InlineData(EgressStatus.EgressAborted, true)]
    [InlineData(EgressStatus.EgressLimitReached, true)]
    [InlineData(EgressStatus.EgressStarting, false)]
    [InlineData(EgressStatus.EgressActive, false)]
    [InlineData(EgressStatus.EgressEnding, false)]
    public void IsTerminal_MatchesTheJobsLifecycle(EgressStatus status, bool expected)
    {
        Assert.Equal(expected, RecordingService.IsTerminal(status));
    }

    [Theory]
    [InlineData(EgressStatus.EgressStarting, "STARTING")]
    [InlineData(EgressStatus.EgressActive, "ACTIVE")]
    [InlineData(EgressStatus.EgressEnding, "ENDING")]
    [InlineData(EgressStatus.EgressComplete, "COMPLETE")]
    [InlineData(EgressStatus.EgressFailed, "FAILED")]
    [InlineData(EgressStatus.EgressAborted, "ABORTED")]
    [InlineData(EgressStatus.EgressLimitReached, "LIMIT_REACHED")]
    public void EgressStatusLabel_MapsEveryKnownState(EgressStatus status, string expected)
    {
        Assert.Equal(expected, RecordingService.EgressStatusLabel(status));
    }

    [Fact]
    public void EgressStatusLabel_UnknownStatesReportUnknown()
    {
        Assert.Equal("UNKNOWN", RecordingService.EgressStatusLabel((EgressStatus)9999));
    }

}
