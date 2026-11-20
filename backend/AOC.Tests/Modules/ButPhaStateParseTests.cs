using System.Text.Json;
using AOC.Api.Http;
using AOC.Api.Modules.Live;
using AOC.Domain.Gameplay.Turns;
using Xunit;

namespace AOC.Tests.Modules;

public class ButPhaStateParseTests
{
    [Fact]
    public void ParseButPha_RoundTripsAStateThatAlreadyScoredPoints()
    {
        var state = new ButPhaState
        {
            QuestionIds = ["bp-1", "bp-2", "bp-3", "bp-4"],
            Answers =
            {
                ["bp-1"] = [new ButPhaAnswer { PlayerId = "u1", Correct = true, AtS = 3.775 }]
            },
            Points =
            {
                ["bp-1"] = new Dictionary<string, int> { ["u1"] = 60 }
            },
        };

        var json = JsonSerializer.SerializeToElement(state, JsonApi.Options);
        var parsed = LiveState.ParseButPha(json);

        Assert.Equal(0, parsed.Cursor);
        Assert.Equal(60, parsed.Points["bp-1"]["u1"]);
        Assert.Equal(3.775, parsed.Answers["bp-1"][0].AtS, 3);
        Assert.False(parsed.Ended);
    }

    [Fact]
    public void ParseButPha_AScoredStateFromARealMatchRoundTrips()
    {
        var json = """
            {"ended": false, "rules": {"bands": [{"points": 15, "untilSec": 5}, {"points": 10, "untilSec": 15}, {"points": 5, "untilSec": 30}], "multipliers": [4, 3, 2], "questionCount": 4, "lateMultiplier": 1, "questionLimitS": 30}, "cursor": 0, "points": {"83ada138-859b-47a1-adf7-a672881d9466": {"01a1eccc-999e-767e-8d9c-c2d6d13e2359": 60}}, "answers": {"83ada138-859b-47a1-adf7-a672881d9466": [{"atS": 3.775, "correct": true, "playerId": "01a1eccc-999e-767e-8d9c-c2d6d13e2359"}]}, "questionIds": ["83ada138-859b-47a1-adf7-a672881d9466", "9cd9d0f1-2c30-46a5-b140-c1f4c702e6fe", "c6eb3116-dc3a-4a8c-8242-2b14876f380d", "79c8c081-c239-4e90-b78a-fdd7594cf31e"], "revealedAnswer": "83ada138-859b-47a1-adf7-a672881d9466", "questionOpenedAt": "2026-11-18T07:40:17.170Z", "questionRevealedAt": "2026-11-18T07:40:11.037Z"}
            """;

        var parsed = LiveState.ParseButPha(JsonSerializer.Deserialize<JsonElement>(json));

        Assert.Equal(0, parsed.Cursor);
        Assert.Equal(60, parsed.Points["83ada138-859b-47a1-adf7-a672881d9466"]["01a1eccc-999e-767e-8d9c-c2d6d13e2359"]);
        Assert.Equal("83ada138-859b-47a1-adf7-a672881d9466", parsed.QuestionIds[0]);
    }
}
