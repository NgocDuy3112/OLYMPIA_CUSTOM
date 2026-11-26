using System.Text.Json;
using AOC.Api.Modules.Live;
using Xunit;

namespace AOC.Tests.Modules;

public class WaitingMarkerTests
{
    private static JsonElement Json(string raw) => JsonDocument.Parse(raw).RootElement.Clone();

    [Fact]
    public void A_waiting_marker_reads_as_paused_and_parses_to_defaults()
    {
        var marker = Json("""{"waiting":true}""");

        Assert.True(LiveFacts.IsWaitingState(marker));
        Assert.False(LiveFacts.IsRoundEnded("but-pha", marker));

        var state = LiveState.ParseButPha(marker);
        Assert.False(state.Ended);
        Assert.Equal(0, state.Cursor);
    }

    [Fact]
    public void A_marker_that_is_not_a_boolean_fails_typed()
    {
        var marker = Json("""{"waiting":"yes"}""");

        var read = Assert.Throws<LiveStateError>(() => LiveFacts.IsWaitingState(marker));
        Assert.Contains("waiting: expected boolean", read.Details);
        Assert.Throws<LiveStateError>(() => LiveState.ParseButPha(marker));
    }

    [Fact]
    public void A_false_marker_is_not_paused()
        => Assert.False(LiveFacts.IsWaitingState(Json("""{"waiting":false}""")));

    [Fact]
    public void A_state_without_the_marker_is_not_paused()
        => Assert.False(LiveFacts.IsWaitingState(Json("""{"ended":false}""")));
}
