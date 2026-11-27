using AOC.Api.Modules.Live;
using AOC.Domain.Contracts;
using AOC.Domain.Gameplay;
using AOC.Domain.Gameplay.Turns;
using Xunit;

namespace AOC.Tests.Modules;

public class GiaiMaLockHintsTests
{
    private const string Now = "2026-01-01T00:00:00.000Z";
    private static readonly string[] Hints = ["h1", "h2", "h3", "h4", "h5", "h6", "h7", "h8"];

    private static GiaiMaContext Ctx(List<AnswerDraft>? drafts = null) =>
        new("operator", "giai-ma", Now, RuleBatches.GiaiMa, "", drafts ?? []);

    private static GiaiMaState OpenHint()
    {
        var state = GiaiMaTurn.StartGiaiMa(["a"], Hints, RuleBatches.GiaiMa);
        state = GiaiMaTurn.PickHint(state, "h1");
        return GiaiMaTurn.StartWindow(state, Now);
    }

    [Fact]
    public void LockHints_consumes_the_hint_without_judging_or_revealing()
    {
        var drafts = new List<AnswerDraft> { new("a", 500) };

        var (next, facts) = GiaiMaApplier.Apply(
            OpenHint(), new LiveAction.GiaiMaLockHints(), Ctx(drafts));

        Assert.Empty(facts);
        Assert.Null(next.OpenHint);
        Assert.Contains("h1", next.Picked);
        Assert.Equal(0, next.Players.Single(p => p.Id == "a").HintsRevealed);
    }

    [Fact]
    public void ResolveHint_judges_from_the_operator_verdicts_and_reveals_to_the_correct()
    {
        var drafts = new List<AnswerDraft> { new("a", 500) };

        var (next, facts) = GiaiMaApplier.Apply(
            OpenHint(), new LiveAction.GiaiMaResolveHint([("a", true)]), Ctx(drafts));

        var judge = Assert.Single(facts.OfType<JudgeFact>());
        Assert.Equal(Verdict.CORRECT, judge.Verdict);
        Assert.Null(next.OpenHint);
        Assert.Equal(1, next.Players.Single(p => p.Id == "a").HintsRevealed);
    }

    [Fact]
    public void SubmitKeyword_records_a_draft_and_locks_the_player_out()
    {
        var (next, facts) = GiaiMaApplier.Apply(
            OpenHint(), new LiveAction.GiaiMaSubmitKeyword("a", "q1", "CHUNGKET"), Ctx());

        Assert.Single(facts.OfType<DraftFact>());
        Assert.True(next.Players.Single(p => p.Id == "a").KeywordLocked);
    }
}
