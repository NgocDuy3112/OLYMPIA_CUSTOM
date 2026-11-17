using System.Text.Json;
using AOC.Api.Http;
using AOC.Api.Modules.Live;
using AOC.Domain.Contracts;
using AOC.Domain.Engine;
using AOC.Domain.Engine.Turns;
using Xunit;
using Xunit.Abstractions;

namespace AOC.Tests.Engine;

public class KhoiDongRoundTripTests
{
    private readonly ITestOutputHelper _out;
    public KhoiDongRoundTripTests(ITestOutputHelper o) => _out = o;

    [Fact]
    public void ChungState_RoundTripsThroughStoreSerializer()
    {
        var rules = new RoundRules.KhoiDongRules(3, 40, 3, 10, 10);
        var qids = new[] { "q1", "q2", "q3" };
        var state = KhoiDongRound.BeginPhase2(
            KhoiDongRound.StartKhoiDong(["p0"], qids, rules),
            qids);
        var picked = KhoiDongRound.NextQuestion(state);
        var judged = KhoiDongRound.JudgeCard(picked, "p0", true);

        var json = JsonSerializer.SerializeToElement(judged, JsonApi.Options);
        _out.WriteLine(json.GetRawText());
        var parsed = LiveState.ParseKhoiDong(json);

        var waiting = JsonSerializer.SerializeToElement(new { waiting = true }, JsonApi.Options);
        LiveState.ParseKhoiDong(waiting);
    }
}
