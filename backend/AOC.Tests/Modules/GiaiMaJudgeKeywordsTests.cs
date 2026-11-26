using System.Text.Json;
using AOC.Api.Modules.Live;
using AOC.Domain.Contracts;
using AOC.Domain.Gameplay;
using AOC.Domain.Gameplay.Turns;
using Xunit;

namespace AOC.Tests.Modules;

public class GiaiMaJudgeKeywordsTests
{
    private const string Now = "2026-01-01T00:00:00.000Z";
    private static readonly string[] Hints = ["h1", "h2", "h3", "h4", "h5", "h6", "h7", "h8"];

    private static GiaiMaContext Ctx() =>
        new("operator", "giai-ma", Now, RuleBatches.GiaiMa, "", []);

    private static GiaiMaState Submitted()
    {
        var state = GiaiMaTurn.StartGiaiMa(["a", "b"], Hints, RuleBatches.GiaiMa);
        return GiaiMaTurn.LockKeyword(GiaiMaTurn.LockKeyword(state, "a"), "b");
    }

    [Fact]
    public void Converter_reads_judgeKeywords_verdicts()
    {
        var json = """
            {"kind":"giai-ma.judgeKeywords","verdicts":[{"playerId":"a","questionId":"q1","correct":true},{"playerId":"b","questionId":"q2","correct":false}]}
            """;

        var action = JsonSerializer.Deserialize<LiveAction>(json, AOC.Api.Http.JsonApi.Options);

        var batch = Assert.IsType<LiveAction.GiaiMaJudgeKeywords>(action);
        Assert.Equal([("a", "q1", true), ("b", "q2", false)], batch.Verdicts);
    }

    [Fact]
    public void JudgeKeywords_matches_judging_one_by_one()
    {
        var batch = new LiveAction.GiaiMaJudgeKeywords([("a", "q1", true), ("b", "q2", false)]);
        var (state, facts) = GiaiMaApplier.Apply(Submitted(), batch, Ctx());

        var judgeFacts = facts.OfType<JudgeFact>().ToList();
        Assert.Equal(2, judgeFacts.Count);
        Assert.Equal("q1", judgeFacts[0].QuestionId);
        Assert.Equal(Verdict.CORRECT, judgeFacts[0].Verdict);
        Assert.Equal("q2", judgeFacts[1].QuestionId);
        Assert.Equal(Verdict.INCORRECT, judgeFacts[1].Verdict);

        Assert.True(state.Players.First(p => p.Id == "a").KeywordPoints > 0);
        Assert.False(state.Players.First(p => p.Id == "a").Eliminated);
        Assert.True(state.Players.First(p => p.Id == "b").Eliminated);
    }

    [Fact]
    public void JudgeKeywords_reports_the_engine_error_of_the_first_bad_verdict()
    {
        var batch = new LiveAction.GiaiMaJudgeKeywords([("ghost", "q1", true)]);
        var error = Assert.Throws<RuleError>(() => GiaiMaApplier.Apply(Submitted(), batch, Ctx()));
        Assert.Equal("UNKNOWN_PLAYER", error.Code);
    }
}
