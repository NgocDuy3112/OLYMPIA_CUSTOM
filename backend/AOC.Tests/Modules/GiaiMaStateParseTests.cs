using System.Text.Json;
using AOC.Api.Http;
using AOC.Api.Modules.Live;
using AOC.Domain.Gameplay.Turns;
using Xunit;

namespace AOC.Tests.Modules;

public class GiaiMaStateParseTests
{
    [Fact]
    public void ParseGiaiMa_RoundTripsANewShapeState()
    {
        var state = new GiaiMaState
        {
            OpenHint = "h2",
            HintWindow = AnswerWindow.TypedEveryone(15).OpenFor("2026-11-18T07:40:17.170Z", 15),
            KeywordClosesAt = "2026-11-18T07:40:35.000Z"
        };

        var json = JsonSerializer.SerializeToElement(state, JsonApi.Options);
        var parsed = LiveState.ParseGiaiMa(json);

        Assert.Equal("h2", parsed.OpenHint);
        Assert.Equal("2026-11-18T07:40:17.170Z", parsed.HintWindow.OpenedAt);
        Assert.Equal(15, parsed.HintWindow.Seconds);
        Assert.Equal("2026-11-18T07:40:35.000Z", parsed.KeywordClosesAt);
    }

    [Fact]
    public void ParseGiaiMa_ANewStateWithoutACountdownStaysOpen()
    {
        var state = new GiaiMaState();
        var json = JsonSerializer.SerializeToElement(state, JsonApi.Options);
        var parsed = LiveState.ParseGiaiMa(json);

        Assert.Null(parsed.KeywordClosesAt);
        Assert.False(parsed.HintWindow.HasStarted);
    }

    [Fact]
    public void ParseGiaiMa_AnOldStateFromARealMatchUpgradesOnRead()
    {
        var json = """
            {"step":"hints","players":[{"id":"u1","hintsRevealed":1,"revealed":["h1"],"keywordLocked":false,"keywordPoints":90,"eliminated":false}],"hintIds":["h1","h2"],"picked":["h1"],"openHint":"h2","openHintAt":"2026-11-18T07:40:17.170Z","keywordOpenedAt":"2026-11-18T07:40:20.000Z","openHintLocked":false}
            """;

        var parsed = LiveState.ParseGiaiMa(JsonSerializer.Deserialize<JsonElement>(json));

        Assert.Equal("h2", parsed.OpenHint);
        Assert.Equal("2026-11-18T07:40:17.170Z", parsed.HintWindow.OpenedAt);
        Assert.Equal(15, parsed.HintWindow.Seconds);
        Assert.Equal("2026-11-18T07:40:35.000Z", parsed.KeywordClosesAt);
    }

    [Fact]
    public void ParseGiaiMa_AnOldStateWithoutAClockUpgradesToAClosedHintWindow()
    {
        var json = """
            {"step":"hints","players":[{"id":"u1","hintsRevealed":0,"revealed":[],"keywordLocked":false,"keywordPoints":0,"eliminated":false}],"hintIds":["h1"],"picked":[],"openHint":"h1","openHintAt":null}
            """;

        var parsed = LiveState.ParseGiaiMa(JsonSerializer.Deserialize<JsonElement>(json));

        Assert.Equal("h1", parsed.OpenHint);
        Assert.False(parsed.HintWindow.HasStarted);
        Assert.Null(parsed.KeywordClosesAt);
    }
}
