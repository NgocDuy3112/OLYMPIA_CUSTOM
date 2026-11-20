using System.Text.Json;
using AOC.Api.Http;
using AOC.Api.Modules.Live;
using AOC.Domain.Contracts;
using AOC.Domain.Gameplay.Turns;
using Xunit;

namespace AOC.Tests.Modules;

public class VeDichStateParseTests
{
    private const string OldBuzzState = """
        {"phase":2,"players":[{"id":"u1","score":0,"powersLeft":["STAR","ASSIGN"]},{"id":"u2","score":0,"powersLeft":["STAR","ASSIGN"]}],"remaining":[],"deferred":[],"turnIndex":0,"pendingPicks":[{"id":"q2","value":50}],"open":{"question":{"id":"q1","value":40},"answerer":"u1","power":"STAR","step":"buzz","openedAt":null,"revealed":true,"buzzer":"u2","buzzerMs":1200,"assignedTo":null},"buzzOpenedAt":"2026-11-18T07:40:17.170Z","buzzLocked":false,"ended":false,"stagedPower":{"power":"STAR","targetId":null},"turnPowerUsed":true,"turnPicked":0,"picksConfirmed":true}
        """;

    private const string OldCurrentState = """
        {"phase":1,"players":[{"id":"u1","score":10,"powersLeft":["STAR","ASSIGN"]}],"remaining":[],"deferred":[],"turnIndex":0,"pendingPicks":[],"open":{"question":{"id":"q1","value":30},"answerer":"u1","power":null,"step":"current","openedAt":"2026-11-18T07:40:10.000Z","revealed":true,"buzzer":null,"buzzerMs":null,"assignedTo":null},"buzzOpenedAt":null,"ended":false,"turnPowerUsed":false,"turnPicked":0,"picksConfirmed":false}
        """;

    private static VeDichState Parse(string json)
        => LiveState.ParseVeDich(JsonSerializer.Deserialize<JsonElement>(json));

    [Fact]
    public void ParseVeDich_AnOldBuzzStateUpgradesToAWindow()
    {
        var parsed = Parse(OldBuzzState);
        var open = parsed.Open!;

        Assert.Equal(AnswerMode.Buzz, open.Window.Mode);
        Assert.Equal(AnswerEligibility.Others, open.Window.Eligibility);
        Assert.Equal("u1", open.Window.TurnPlayerId);
        Assert.Equal("u2", open.Window.Buzzer);
        Assert.Equal(1200, open.Window.BuzzerMs);
        Assert.Equal("2026-11-18T07:40:17.170Z", open.Window.OpenedAt);
        Assert.Equal(5, open.Window.Seconds);
        Assert.True(VeDichTurn.IsBuzzOpen(parsed, "2026-11-18T07:40:20.000Z"));
        Assert.False(VeDichTurn.IsBuzzOpen(parsed, "2026-11-18T07:40:23.000Z"));
    }

    [Fact]
    public void ParseVeDich_AnOldBuzzStateUpgradesPowers()
    {
        var parsed = Parse(OldBuzzState);
        var u1 = parsed.Players.First(p => p.Id == "u1");

        Assert.Equal([PowerKind.STAR, PowerKind.ASSIGN], u1.Powers.Available);
        Assert.True(u1.Powers.UsedThisTurn);
        Assert.Equal(PowerKind.STAR, u1.Powers.Staged!.Power);

        var u2 = parsed.Players.First(p => p.Id == "u2");
        Assert.False(u2.Powers.UsedThisTurn);
        Assert.Null(u2.Powers.Staged);
    }

    [Fact]
    public void ParseVeDich_AnOldOpenQuestionUpgradesToTheQuestionClock()
    {
        var parsed = Parse(OldCurrentState);
        var open = parsed.Open!;

        Assert.Equal(AnswerMode.Oral, open.Window.Mode);
        Assert.Equal("u1", open.Window.TurnPlayerId);
        Assert.Equal("2026-11-18T07:40:10.000Z", open.Window.OpenedAt);
        Assert.Equal(20, open.Window.Seconds);
        Assert.Null(open.Window.Buzzer);
    }

    [Fact]
    public void ParseVeDich_TheUpgradedStateWritesOnlyTheNewFields()
    {
        var written = JsonSerializer.SerializeToElement(Parse(OldBuzzState), JsonApi.Options);

        Assert.False(written.TryGetProperty("buzzOpenedAt", out _));
        Assert.False(written.TryGetProperty("buzzLocked", out _));
        Assert.False(written.TryGetProperty("stagedPower", out _));
        Assert.False(written.TryGetProperty("turnPowerUsed", out _));

        var open = written.GetProperty("open");
        Assert.True(open.TryGetProperty("window", out _));
        Assert.False(open.TryGetProperty("step", out _));
        Assert.False(open.TryGetProperty("buzzer", out _));
        Assert.False(open.TryGetProperty("buzzerMs", out _));
        Assert.False(open.TryGetProperty("assignedTo", out _));

        var player = written.GetProperty("players")[0];
        Assert.True(player.TryGetProperty("powers", out _));
        Assert.False(player.TryGetProperty("powersLeft", out _));
    }

    [Fact]
    public void ParseVeDich_ANewStateRoundTrips()
    {
        var state = new VeDichState
        {
            Phase = 2,
            Players = [new VeDichPlayerState { Id = "u1", Score = 0, Powers = PowerSet.Fresh() }]
        };

        var written = JsonSerializer.SerializeToElement(state, JsonApi.Options);
        var parsed = LiveState.ParseVeDich(written);

        Assert.Equal([PowerKind.STAR, PowerKind.ASSIGN], parsed.Players[0].Powers.Available);
        Assert.False(parsed.Players[0].Powers.UsedThisTurn);
    }
}
