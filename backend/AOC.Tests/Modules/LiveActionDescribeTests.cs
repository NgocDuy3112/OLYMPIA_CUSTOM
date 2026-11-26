using AOC.Api.Modules.Live;
using AOC.Infrastructure.Data;
using Xunit;

namespace AOC.Tests.Modules;

public class LiveActionDescribeTests
{
    [Fact]
    public void Judge_describes_answer_judged_with_the_round_and_player()
    {
        var described = new LiveAction.KhoiDongJudge("p1", true).Describe("khoi-dong")!.Value;

        Assert.Equal("answer_judged", described.Action);
        var details = JsonDefaults.Serialize(described.Details);
        Assert.Equal("khoi-dong", details.GetProperty("roundId").GetString());
        Assert.Equal("p1", details.GetProperty("playerId").GetString());
        Assert.True(details.GetProperty("correct").GetBoolean());
    }

    [Fact]
    public void Resolve_keeps_a_null_buzzer_key()
    {
        var described = new LiveAction.VeDichResolve(true, null).Describe("ve-dich")!.Value;

        Assert.Equal("ve_dich_resolved", described.Action);
        var details = JsonDefaults.Serialize(described.Details);
        Assert.True(details.GetProperty("answerer").GetBoolean());
        Assert.Equal(System.Text.Json.JsonValueKind.Null, details.GetProperty("buzzer").ValueKind);
    }

    [Fact]
    public void Score_adjustment_describes_user_delta_and_reason()
    {
        var described = new LiveAction.ScoreAdjust("u1", -5, "typo").Describe("but-pha")!.Value;

        Assert.Equal("score_adjusted", described.Action);
        var details = JsonDefaults.Serialize(described.Details);
        Assert.Equal("u1", details.GetProperty("userId").GetString());
        Assert.Equal(-5, details.GetProperty("delta").GetInt32());
        Assert.Equal("typo", details.GetProperty("reason").GetString());
    }

    [Fact]
    public void An_action_outside_the_audit_set_has_no_description()
        => Assert.Null(new LiveAction.VeDichStart(null).Describe("ve-dich"));
}
