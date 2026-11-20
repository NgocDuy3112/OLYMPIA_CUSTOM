using System.Text.Json;
using AOC.Api.Http;
using AOC.Api.Modules.Live;
using AOC.Domain.Contracts;
using AOC.Domain.Gameplay.Turns;
using Xunit;

namespace AOC.Tests.Modules;

public class KhoiDongStateParseTests
{
    private const string OldPhaseOne = """
        {"step":"phase1","ended":false,"order":["u1"],"activeIndex":0,"runs":{"u1":{"kind":"phase1","questionIds":["a1","a2"],"cursor":1,"elapsedS":5,"results":{"a1":{"correct":true,"points":10}},"ended":false,"budgetS":40,"pointsPerCorrect":10}},"phase2":null}
        """;

    private const string OldPhaseTwo = """
        {"step":"phase2","ended":false,"order":["u1"],"activeIndex":1,"runs":{"u1":{"kind":"phase1","questionIds":["a1"],"cursor":1,"elapsedS":5,"results":{},"ended":true,"budgetS":40,"pointsPerCorrect":10}},"phase2":{"kind":"phase2","pointsPerCorrect":10,"windowS":10,"questionIds":["b1","b2"],"index":0,"openedAt":"2026-11-18T07:40:17.170Z","results":{},"closed":false}}
        """;

    private static KhoiDongState Parse(string json)
        => LiveState.ParseKhoiDong(JsonSerializer.Deserialize<JsonElement>(json));

    [Fact]
    public void ParseKhoiDong_AnOldPhaseOneStateUpgradesStepToFlow()
    {
        var parsed = Parse(OldPhaseOne);

        Assert.Equal(Flow.rieng, parsed.Flow);
        Assert.Null(parsed.Phase2);
        Assert.Equal(1, parsed.Runs["u1"].Cursor);
    }

    [Fact]
    public void ParseKhoiDong_AnOldPhaseTwoStateUpgradesStepAndBuildsTheWindow()
    {
        var parsed = Parse(OldPhaseTwo);

        Assert.Equal(Flow.chung, parsed.Flow);
        Assert.Equal("2026-11-18T07:40:17.170Z", parsed.Phase2!.Window.OpenedAt);
        Assert.Equal(10, parsed.Phase2!.Window.Seconds);
        Assert.True(KhoiDongTurn.IsPhase2WindowOpen(parsed.Phase2, "2026-11-18T07:40:27.170Z"));
        Assert.False(KhoiDongTurn.IsPhase2WindowOpen(parsed.Phase2, "2026-11-18T07:40:27.171Z"));
    }

    [Fact]
    public void ParseKhoiDong_TheUpgradedStateWritesOnlyTheNewFields()
    {
        var written = JsonSerializer.SerializeToElement(Parse(OldPhaseTwo), JsonApi.Options);

        Assert.False(written.TryGetProperty("step", out _));
        Assert.True(written.TryGetProperty("flow", out _));
        var phase2 = written.GetProperty("phase2");
        Assert.False(phase2.TryGetProperty("windowS", out _));
        Assert.False(phase2.TryGetProperty("openedAt", out _));
        Assert.True(phase2.TryGetProperty("window", out _));
    }

    [Fact]
    public void ParseKhoiDong_AnOldPhaseTwoStateWithoutWindowSIsRejected()
    {
        var json = OldPhaseTwo.Replace("\"windowS\":10,", "");

        var error = Assert.Throws<LiveStateError>(() => Parse(json));

        Assert.Contains(error.Details, detail => detail.Contains("phase2.windowS"));
    }
}
