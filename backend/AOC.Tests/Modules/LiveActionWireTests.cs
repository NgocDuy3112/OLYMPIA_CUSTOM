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
}
