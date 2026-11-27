using AOC.Api.Modules.Live;
using AOC.Domain.Contracts;
using AOC.Domain.Gameplay;
using AOC.Domain.Gameplay.Turns;
using Xunit;

namespace AOC.Tests.Modules;

public class VeDichApplierTests
{
    private const string Now = "2026-01-01T00:00:00.000Z";

    private static VeDichQuestion Question(string id, int value) => new()
    {
        Id = id,
        Value = value
    };

    private static List<VeDichQuestion> Cells(int value, int count)
    {
        var list = new List<VeDichQuestion>();
        for (var i = 1; i <= count; i++) list.Add(Question($"{value}-{i}", value));
        return list;
    }

    private static VeDichState Phase1Open()
    {
        var state = VeDichTurn.CreateVeDich(
            [.. Cells(20, 6), .. Cells(30, 6), .. Cells(40, 4), .. Cells(50, 4)],
            [new VeDichPlayerState
            {
                Id = "a",
                Score = 0,
                Powers = PowerSet.Fresh()
            }]);
        return VeDichTurn.PickPhase1(state, "a", "20-1");
    }

    private static List<VeDichQuestion> Board() =>
        [.. Cells(20, 6), .. Cells(30, 6), .. Cells(40, 4), .. Cells(50, 4)];

    private static VeDichApplier.VeDichContext Ctx(List<AnswerDraft> drafts) =>
        new("operator", "ve-dich", Now, RuleBatches.VeDich, [], [], drafts);

    private static VeDichApplier.VeDichContext CtxWithScores(
        List<(string Id, int Score)> players) =>
        new("operator", "ve-dich", Now, RuleBatches.VeDich, [], players, []);

    [Fact]
    public void Judge_DeductsFromAPlayerWhoNeverAnswered()
    {
        var (_, facts) = VeDichApplier.Apply(
            Phase1Open(), new LiveAction.VeDichJudge("ghost", true), Ctx([]));

        var judge = Assert.Single(facts.OfType<JudgeFact>());
        Assert.Equal("ghost", judge.UserId);
        Assert.Equal(Verdict.INCORRECT, judge.Verdict);
        Assert.Equal(-10, judge.PointsAwarded);
    }

    [Fact]
    public void Judge_AcceptsTheAnswererAndEmitsAJudgeFact()
    {
        // Any submitted answer counts — no draft/final distinction any more.
        var answered = new List<AnswerDraft> { new("a", 1200) };

        var (_, facts) = VeDichApplier.Apply(
            Phase1Open(), new LiveAction.VeDichJudge("a", true), Ctx(answered));

        var judge = Assert.Single(facts.OfType<JudgeFact>());
        Assert.Equal("20-1", judge.QuestionId);
        Assert.Equal("a", judge.UserId);
        Assert.Equal(Verdict.CORRECT, judge.Verdict);
        Assert.Equal(20, judge.PointsAwarded);
    }

    [Fact]
    public void Judge_KnowsWhoAnsweredFromTheDraftList()
    {
        var answered = new List<AnswerDraft> { new("a", 1200) };

        var (_, facts) = VeDichApplier.Apply(
            Phase1Open(), new LiveAction.VeDichResolve(true, null), Ctx(answered));

        var judge = Assert.Single(facts.OfType<JudgeFact>());
        Assert.Equal("a", judge.UserId);
        Assert.Equal(Verdict.CORRECT, judge.Verdict);
    }

    [Fact]
    public void ResolveActionRefusesWhileAnAssignRaceIsStillRunning()
    {
        var state = VeDichTurn.CreateVeDich(
            Board(),
            [
                new VeDichPlayerState { Id = "a", Score = 0, Powers = PowerSet.Fresh() },
                new VeDichPlayerState { Id = "b", Score = 0, Powers = PowerSet.Fresh() }
            ]);
        state = VeDichTurn.BeginPhase2(state);
        var a = state.Players[0].Id;
        var b = state.Players[1].Id;
        state = VeDichTurn.PickPhase2(state, a, ["40-1"]);
        state = VeDichTurn.OpenPhase2Question(
            VeDichTurn.DeclarePower(state, a, PowerKind.ASSIGN, b), "40-1", Now);

        var error = Assert.Throws<VeDichRuleError>(() =>
            VeDichApplier.Apply(state, new LiveAction.VeDichResolve(false, null), Ctx([])));
        Assert.Equal("RACE_IN_PROGRESS", error.Code);
    }

    [Fact]
    public void ResolveActionRefusesAPhase1TypedQuestionWithNoAnswerer()
    {
        // Phase 1 questions opened from the confirmed batch have no single
        // answerer — a resolve would write an answer for the empty user id.
        var state = VeDichTurn.OpenPending(
            VeDichTurn.ConfirmPicks(VeDichTurn.PickRound(
                VeDichTurn.CreateVeDich(Board(), [
                    new VeDichPlayerState { Id = "a", Score = 0, Powers = PowerSet.Fresh() }]),
                ["20-1"])),
            "20-1");

        var error = Assert.Throws<VeDichRuleError>(() =>
            VeDichApplier.Apply(state, new LiveAction.VeDichResolve(true, null), Ctx([])));
        Assert.Equal("INVALID_ANSWERER", error.Code);
    }

    [Fact]
    public void StartPhase2_KeepsAPlayedPhase1QuestionOffTheBoard()
    {
        var state = VeDichTurn.CreateVeDich(
            Board(), [new VeDichPlayerState { Id = "a", Score = 0, Powers = PowerSet.Fresh() }]);
        var ended = VeDichTurn.AdvanceTurn(VeDichTurn.ResolveQuestion(
            VeDichTurn.PickPhase1(state, "a", "20-1"), new Verdicts(true, null), Now));

        var (phase2, _) = VeDichApplier.Apply(
            ended, new LiveAction.VeDichStart(2), CtxWithScores([("a", 20)]));

        Assert.Equal(2, phase2.Phase);
        Assert.DoesNotContain(phase2.Remaining, q => q.Id == "20-1");
        Assert.Throws<VeDichRuleError>(() =>
            VeDichTurn.PickPhase2(phase2, "a", ["20-1"]));
    }

    [Fact]
    public void BeginPhase2_OrdersTurnsByThePointsJudgedInPhase1()
    {
        var state = VeDichTurn.CreateVeDich(
            Board(),
            [
                new VeDichPlayerState { Id = "a", Score = 0, Powers = PowerSet.Fresh() },
                new VeDichPlayerState { Id = "b", Score = 0, Powers = PowerSet.Fresh() }
            ]);
        // Model A: confirm one question per player, then play the whole batch.
        var picked = VeDichTurn.ConfirmPicks(
            VeDichTurn.PickRound(state, ["20-1", "20-2"]));
        var opened = VeDichTurn.OpenPending(picked, "20-1");

        // The judge action records points as facts (the answers table is the
        // source of truth), so phase 2 gets those totals through the context.
        var (_, facts) = VeDichApplier.Apply(
            opened, new LiveAction.VeDichJudge("a", true), Ctx([new("a", 1200)]));
        var sums = facts.OfType<JudgeFact>()
            .GroupBy(f => f.UserId)
            .ToDictionary(g => g.Key, g => g.Sum(f => f.PointsAwarded));

        // The console plays the batch out: reveal each question, start its clock,
        // close it, then move on to the next one.
        VeDichState CloseOpen(VeDichState state) => VeDichTurn.CloseQuestion(
            VeDichTurn.StartClock(VeDichTurn.RevealQuestion(state, Now), Now));
        var phase1Done = CloseOpen(VeDichTurn.OpenPending(CloseOpen(opened), "20-2"));
        var (phase2, _) = VeDichApplier.Apply(
            phase1Done, new LiveAction.VeDichBeginPhase2(),
            CtxWithScores([("a", sums.GetValueOrDefault("a")), ("b", sums.GetValueOrDefault("b"))]));

        Assert.Equal(["b", "a"], phase2.Players.Select(p => p.Id));
    }
}
