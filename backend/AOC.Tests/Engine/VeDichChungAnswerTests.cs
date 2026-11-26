using AOC.Domain.Contracts;
using AOC.Domain.Gameplay;
using AOC.Domain.Gameplay.Turns;
using Xunit;

namespace AOC.Tests.Engine;

public class VeDichChungAnswerTests
{
    private static VeDichState Phase1WithOpenQuestion()
    {
        var players = new List<VeDichPlayerState>
        {
            new() { Id = "u1", Score = 0, Powers = PowerSet.Fresh() },
            new() { Id = "u2", Score = 0, Powers = PowerSet.Fresh() },
            new() { Id = "u3", Score = 0, Powers = PowerSet.Fresh() },
        };
        var questions = new List<VeDichQuestion>();
        for (var i = 0; i < 6; i++) questions.Add(new VeDichQuestion { Id = $"q20-{i}", Value = 20 });
        for (var i = 0; i < 6; i++) questions.Add(new VeDichQuestion { Id = $"q30-{i}", Value = 30 });
        for (var i = 0; i < 4; i++) questions.Add(new VeDichQuestion { Id = $"q40-{i}", Value = 40 });
        for (var i = 0; i < 4; i++) questions.Add(new VeDichQuestion { Id = $"q50-{i}", Value = 50 });

        var state = VeDichTurn.CreateVeDich(questions, players, RuleBatches.VeDich);
        state = VeDichTurn.PickRound(state, ["q20-0"]);
        return VeDichTurn.OpenPending(state, "q20-0");
    }

    [Fact]
    public void Opening_a_phase1_question_lets_everyone_answer()
    {
        var state = Phase1WithOpenQuestion();

        Assert.Equal(AnswerEligibility.Everyone, state.Open!.Window.Eligibility);
        Assert.Equal(AnswerMode.Typed, state.Open.Window.Mode);
    }

    [Fact]
    public void Every_player_can_answer_once_the_clock_runs()
    {
        var revealed = VeDichTurn.RevealQuestion(Phase1WithOpenQuestion(), "2026-01-01T00:00:00.000Z");
        var state = VeDichTurn.StartClock(revealed, "2026-01-01T00:00:00.000Z");

        foreach (var player in new[] { "u1", "u2", "u3" })
        {
            var window = state.Open!.Window;
            window.AssertCanAnswer(player, "2026-01-01T00:00:05.000Z");
        }
    }

    [Fact]
    public void Nobody_can_answer_before_the_clock_starts()
    {
        var state = Phase1WithOpenQuestion();

        var error = Assert.Throws<RuleError>(() =>
            state.Open!.Window.AssertCanAnswer("u1", "2026-01-01T00:00:05.000Z"));
        Assert.Equal("WINDOW_NOT_OPEN", error.Code);
    }

    private static VeDichState Phase1Picked(params string[] ids)
    {
        var questions = new List<VeDichQuestion>();
        for (var i = 0; i < 6; i++) questions.Add(new VeDichQuestion { Id = $"q20-{i}", Value = 20 });
        for (var i = 0; i < 6; i++) questions.Add(new VeDichQuestion { Id = $"q30-{i}", Value = 30 });
        for (var i = 0; i < 4; i++) questions.Add(new VeDichQuestion { Id = $"q40-{i}", Value = 40 });
        for (var i = 0; i < 4; i++) questions.Add(new VeDichQuestion { Id = $"q50-{i}", Value = 50 });
        var players = new List<VeDichPlayerState>
        {
            new() { Id = "u1", Powers = PowerSet.Fresh() },
            new() { Id = "u2", Powers = PowerSet.Fresh() },
            new() { Id = "u3", Powers = PowerSet.Fresh() },
            new() { Id = "u4", Powers = PowerSet.Fresh() },
        };
        var state = VeDichTurn.CreateVeDich(questions, players, RuleBatches.VeDich);
        return VeDichTurn.PickRound(state, ids);
    }

    [Fact]
    public void The_turn_keeps_its_questions_after_one_is_opened()
    {
        var picked = Phase1Picked("q20-0", "q20-1", "q30-0", "q30-1");
        Assert.Equal(4, picked.TurnQuestions!.Count);

        var opened = VeDichTurn.OpenPending(picked, "q20-0");
        Assert.Equal(4, opened.TurnQuestions!.Count);
        Assert.Equal(3, opened.PendingPicks.Count);
    }

    [Fact]
    public void Closing_a_question_plays_it_for_good()
    {
        var opened = VeDichTurn.OpenPending(Phase1Picked("q20-0", "q20-1"), "q20-0");
        var closed = VeDichTurn.CloseQuestion(opened);

        Assert.Null(closed.Open);
        Assert.DoesNotContain(closed.PendingPicks, q => q.Id == "q20-0");
        Assert.Contains(closed.Played, q => q.Id == "q20-0");
        Assert.Equal(2, closed.TurnQuestions!.Count);
    }

    [Fact]
    public void AClosedQuestionNeverReturnsToThePhase2Pool()
    {
        var picked = VeDichTurn.PickRound(
            Phase1PlayerState(), ["q20-0", "q20-1"]);
        var closed = VeDichTurn.CloseQuestion(VeDichTurn.OpenPending(picked, "q20-0"));

        var advanced = VeDichTurn.AdvanceTurn(closed);
        Assert.DoesNotContain(advanced.Remaining, q => q.Id == "q20-0");

        var second = VeDichTurn.CloseQuestion(VeDichTurn.OpenPending(closed, "q20-1"));
        var phase2 = VeDichTurn.BeginPhase2(second);
        Assert.DoesNotContain(phase2.Remaining, q => q.Id == "q20-0");
        Assert.DoesNotContain(phase2.Remaining, q => q.Id == "q20-1");
    }

    [Fact]
    public void ModelA_ConfirmThenPlayTheWholeBatchUnlocksPhase2()
    {
        var state = Phase1PlayerState();
        var ids = new[] { "q20-0", "q20-1" };

        var picked = VeDichTurn.PickRound(state, ids);
        var confirmed = VeDichTurn.ConfirmPicks(picked);
        Assert.True(confirmed.PicksConfirmed);
        Assert.False(VeDichTurn.Phase1Complete(confirmed));

        var afterFirst = VeDichTurn.CloseQuestion(VeDichTurn.OpenPending(confirmed, ids[0]));
        Assert.False(VeDichTurn.Phase1Complete(afterFirst));

        var afterLast = VeDichTurn.CloseQuestion(VeDichTurn.OpenPending(afterFirst, ids[1]));
        Assert.True(VeDichTurn.Phase1Complete(afterLast));

        var phase2 = VeDichTurn.BeginPhase2(afterLast);
        Assert.Equal(2, phase2.Phase);
        Assert.False(phase2.PicksConfirmed);
        Assert.DoesNotContain(phase2.Remaining, q => ids.Contains(q.Id));
    }

    [Fact]
    public void BeginPhase2RefusesAPartlyPlayedBatch()
    {
        var picked = VeDichTurn.PickRound(Phase1PlayerState(), ["q20-0", "q20-1"]);
        var partly = VeDichTurn.CloseQuestion(VeDichTurn.OpenPending(picked, "q20-0"));

        var error = Assert.Throws<VeDichRuleError>(() => VeDichTurn.BeginPhase2(partly));
        Assert.Equal("PHASE1_INCOMPLETE", error.Code);
    }

    private static VeDichState Phase1PlayerState()
    {
        var questions = new List<VeDichQuestion>();
        for (var i = 0; i < 6; i++) questions.Add(new VeDichQuestion { Id = $"q20-{i}", Value = 20 });
        for (var i = 0; i < 6; i++) questions.Add(new VeDichQuestion { Id = $"q30-{i}", Value = 30 });
        for (var i = 0; i < 4; i++) questions.Add(new VeDichQuestion { Id = $"q40-{i}", Value = 40 });
        for (var i = 0; i < 4; i++) questions.Add(new VeDichQuestion { Id = $"q50-{i}", Value = 50 });
        var players = new List<VeDichPlayerState>
        {
            new() { Id = "u1", Powers = PowerSet.Fresh() },
            new() { Id = "u2", Powers = PowerSet.Fresh() },
        };
        return VeDichTurn.CreateVeDich(questions, players, RuleBatches.VeDich);
    }

    [Fact]
    public void A_new_turn_forgets_the_old_strip()
    {
        var picked = Phase1Picked("q20-0", "q20-1");
        var next = VeDichTurn.AdvanceTurn(picked);
        Assert.Empty(next.TurnQuestions!);
    }
}
