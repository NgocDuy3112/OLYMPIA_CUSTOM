using System.Text.Json;
using AOC.Api.Modules.Live;
using Xunit;

namespace AOC.Tests.Modules;

public class LiveActionWireTests
{
    private static LiveAction? Parse(string json)
        => JsonSerializer.Deserialize<LiveAction>(json, AOC.Api.Http.JsonApi.Options);

    [Fact]
    public void A_verdict_without_a_player_id_is_refused()
    {
        var error = Assert.Throws<JsonException>(() => Parse(
            """{"kind":"khoi-dong.judge","correct":true}"""));

        Assert.Contains("playerId", error.Message);
    }

    [Fact]
    public void A_keyword_verdict_without_a_question_id_is_refused()
    {
        var error = Assert.Throws<JsonException>(() => Parse(
            """{"kind":"giai-ma.judgeKeywords","verdicts":[{"playerId":"a","correct":true}]}"""));

        Assert.Contains("'questionId' at 'verdicts[0]'", error.Message);
    }

    [Fact]
    public void A_player_list_entry_that_is_not_a_string_is_refused()
    {
        var error = Assert.Throws<JsonException>(() => Parse(
            """{"kind":"giai-ma.start","playerIds":["a",7],"hintIds":["h1"]}"""));

        Assert.Contains("playerIds[1]", error.Message);
    }

    [Fact]
    public void A_judge_frame_carries_an_explicit_correct_false()
    {
        var action = Parse(
            """{"kind":"khoi-dong.judge","playerId":"u1","correct":false}""");

        var judge = Assert.IsType<LiveAction.KhoiDongJudge>(action);
        Assert.False(judge.Correct);
    }

    [Fact]
    public void A_verdict_entry_carries_an_explicit_correct_value()
    {
        var action = Parse(
            """{"kind":"but-pha.finalize","questionId":"q1","verdicts":[{"playerId":"u2","correct":false}]}""");

        var finalize = Assert.IsType<LiveAction.ButPhaFinalize>(action);
        Assert.Equal(("u2", false), Assert.Single(finalize.Verdicts));
    }

    [Fact]
    public void A_judge_frame_without_correct_is_refused()
    {
        var error = Assert.Throws<JsonException>(() => Parse(
            """{"kind":"ve-dich.judge","playerId":"u1"}"""));

        Assert.Contains("'correct'", error.Message);
    }

    [Fact]
    public void A_judge_frame_with_a_non_boolean_correct_is_refused()
    {
        var error = Assert.Throws<JsonException>(() => Parse(
            """{"kind":"khoi-dong.judge","playerId":"u1","correct":"yes"}"""));

        Assert.Contains("missing boolean 'correct'", error.Message);
    }

    [Fact]
    public void A_resolve_without_answerer_is_refused()
    {
        var error = Assert.Throws<JsonException>(() => Parse(
            """{"kind":"ve-dich.resolve","buzzer":true}"""));

        Assert.Contains("'answerer'", error.Message);
    }

    [Fact]
    public void A_verdict_entry_without_correct_is_refused_with_its_index()
    {
        var error = Assert.Throws<JsonException>(() => Parse(
            """{"kind":"but-pha.finalize","questionId":"q1","verdicts":[{"playerId":"u2"}]}"""));

        Assert.Contains("missing boolean 'correct' at 'verdicts[0]'", error.Message);
    }

    [Fact]
    public void A_keyword_verdict_entry_without_correct_is_refused_with_its_index()
    {
        var error = Assert.Throws<JsonException>(() => Parse(
            """{"kind":"giai-ma.judgeKeywords","verdicts":[{"playerId":"a","questionId":"q1"}]}"""));

        Assert.Contains("missing boolean 'correct' at 'verdicts[0]'", error.Message);
    }
}
