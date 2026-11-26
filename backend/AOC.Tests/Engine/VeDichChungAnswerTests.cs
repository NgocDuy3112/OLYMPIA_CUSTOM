using AOC.Domain.Contracts;
using AOC.Domain.Gameplay;
using AOC.Domain.Gameplay.Turns;
using Xunit;

namespace AOC.Tests.Engine;

public class VeDichChungAnswerTests
{
    private const string Now = "2026-01-01T00:00:00.000Z";

    /// <summary>
    /// The console's phase-1 flow for one question of the confirmed batch: open it,
    /// reveal it, start its clock, then close the turn — the engine refuses to close
    /// a question nobody has seen or clocked yet.
    /// </summary>
    private static VeDichState ClosePlayed(VeDichState state, string questionId)
    {
        var opened = VeDichTurn.OpenPending(state, questionId);
        return VeDichTurn.CloseQuestion(
            VeDichTurn.StartClock(VeDichTurn.RevealQuestion(opened, Now), Now));
    }

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
        state = VeDichTurn.ConfirmPicks(VeDichTurn.PickRound(state, ["q20-0", "q20-1", "q20-2"]));
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
        // Model A: nothing goes on stage before the console confirms the batch
        // (one question per player).
        return VeDichTurn.ConfirmPicks(VeDichTurn.PickRound(state, ids));
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
        var closed = ClosePlayed(Phase1Picked("q20-0", "q20-1", "q30-0", "q30-1"), "q20-0");

        Assert.Null(closed.Open);
        Assert.DoesNotContain(closed.PendingPicks, q => q.Id == "q20-0");
        Assert.Contains(closed.Played, q => q.Id == "q20-0");
        Assert.Equal(4, closed.TurnQuestions!.Count);
    }

    [Fact]
    public void AClosedQuestionNeverReturnsToThePhase2Pool()
    {
        var picked = VeDichTurn.ConfirmPicks(VeDichTurn.PickRound(
            Phase1PlayerState(), ["q20-0", "q20-1"]));
        var closed = ClosePlayed(picked, "q20-0");

        var advanced = VeDichTurn.AdvanceTurn(closed);
        Assert.DoesNotContain(advanced.Remaining, q => q.Id == "q20-0");

        var second = ClosePlayed(closed, "q20-1");
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

        var afterFirst = ClosePlayed(confirmed, ids[0]);
        Assert.False(VeDichTurn.Phase1Complete(afterFirst));

        var afterLast = ClosePlayed(afterFirst, ids[1]);
        Assert.True(VeDichTurn.Phase1Complete(afterLast));

        var phase2 = VeDichTurn.BeginPhase2(afterLast);
        Assert.Equal(2, phase2.Phase);
        Assert.False(phase2.PicksConfirmed);
        Assert.DoesNotContain(phase2.Remaining, q => ids.Contains(q.Id));
    }

    [Fact]
    public void BeginPhase2RefusesAPartlyPlayedBatch()
    {
        var picked = VeDichTurn.ConfirmPicks(
            VeDichTurn.PickRound(Phase1PlayerState(), ["q20-0", "q20-1"]));
        var partly = ClosePlayed(picked, "q20-0");

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
        var picked = Phase1Picked("q20-0", "q20-1", "q30-0", "q30-1");
        var next = VeDichTurn.AdvanceTurn(picked);
        Assert.Empty(next.TurnQuestions!);
    }

    [Fact]
    public void Clearing_the_picks_empties_the_strip()
    {
        var picked = Phase1Picked("q20-0", "q20-1", "q30-0", "q30-1");
        Assert.Equal(4, picked.TurnQuestions!.Count);

        var cleared = VeDichTurn.ClearPicks(picked);

        Assert.Empty(cleared.PendingPicks);
        Assert.Empty(cleared.TurnQuestions!);
        Assert.False(cleared.PicksConfirmed);
        Assert.All(picked.PendingPicks, q => Assert.Contains(cleared.Remaining, r => r.Id == q.Id));
    }

    [Fact]
    public void Opening_a_question_before_confirm_is_refused()
    {
        // Model A: the picked set is still editable until the console confirms it,
        // so nothing of it may go on stage yet.
        var picked = VeDichTurn.PickRound(Phase1PlayerState(), ["q20-0", "q20-1"]);

        var error = Assert.Throws<VeDichRuleError>(() => VeDichTurn.OpenPending(picked, "q20-0"));
        Assert.Equal("PICKS_NOT_CONFIRMED", error.Code);
    }

    [Fact]
    public void Stepping_the_strip_before_confirm_is_refused()
    {
        var picked = VeDichTurn.PickRound(Phase1PlayerState(), ["q20-0", "q20-1"]);

        var error = Assert.Throws<VeDichRuleError>(() => VeDichTurn.NextQuestion(picked));
        Assert.Equal("PICKS_NOT_CONFIRMED", error.Code);
    }
}
