using AOC.Domain.Contracts;
using AOC.Domain.Gameplay;
using AOC.Domain.Gameplay.Turns;
using Xunit;

namespace AOC.Tests.Engine;

public partial class VeDichTurnTests
{
    [Fact]
    public void Board_AcceptsTheShowsBoard()
    {
        var _ = VeDichTurn.CreateVeDich(Board(), [Player("a", 0)]);
    }

    [Fact]
    public void Board_RefusesWrongCounts()
    {
        var sixByFour = new List<VeDichQuestion>();
        foreach (var value in new[] { 20, 30, 40, 50 })
            sixByFour.AddRange(Cells(value, 6));
        Assert.Equal(24, sixByFour.Count);
        Assert.Equal("BOARD_COMPOSITION", CodeOf(() =>
            VeDichTurn.CreateVeDich(sixByFour, [Player("a", 0)])));
    }

    [Fact]
    public void Board_RefusesUnknownFaceValueAndSaysWhatItGot()
    {
        var odd = Board().Take(19).ToList();
        odd.Add(Cell(60, 1));
        var error = Assert.Throws<VeDichRuleError>(() =>
            VeDichTurn.CreateVeDich(odd, [Player("a", 0)]));
        Assert.Equal("BOARD_COMPOSITION", error.Code);
        Assert.Contains("60×1 (not a face value)", error.Message);
        Assert.Contains("50×3 (want 4)", error.Message);
    }

    [Fact]
    public void Pick1_CurrentPlayerTakesTheQuestion()
    {
        var state = VeDichTurn.CreateVeDich(Pool, [Player("a", 0), Player("b", 0)]);
        var next = VeDichTurn.PickPhase1(state, "a", "30-1");
        Assert.Equal("30-1", next.Open!.Question.Id);
        Assert.DoesNotContain(next.Remaining, q => q.Id == "30-1");
    }

    [Fact]
    public void Pick1_PicksEitherBand()
    {
        var state = VeDichTurn.CreateVeDich(Pool, [Player("a", 0)]);
        var next = VeDichTurn.PickPhase1(state, "a", "20-1");
        Assert.Equal("20-1", next.Open!.Question.Id);
    }

    [Fact]
    public void Pick1_RejectsWrongTurn()
    {
        var state = VeDichTurn.CreateVeDich(Pool, [Player("a", 90), Player("b", 0)]);
        Assert.Equal("NOT_YOUR_TURN", CodeOf(() => VeDichTurn.PickPhase1(state, "b", "50-1")));
    }

    [Fact]
    public void Pick1_RejectsPhase2Mode()
    {
        var state = VeDichTurn.CreateVeDich(Pool, [Player("a", 0)]) with { Phase = 2 };
        Assert.Equal("WRONG_PHASE", CodeOf(() => VeDichTurn.PickPhase1(state, "a", "50-1")));
    }

    [Fact]
    public void Chung_PartitionRule()
    {
        var state = VeDichTurn.CreateVeDich(Pool, [Player("a", 0)]);
        Assert.Equal(6, CountOf(state.Remaining, 20));
        Assert.Equal(6, CountOf(state.Remaining, 30));
        Assert.All(state.Remaining, q => Assert.True(q.Value is 20 or 30));
        Assert.Equal(4, CountOf(state.Deferred!, 40));
        Assert.Equal(4, CountOf(state.Deferred!, 50));
    }

    [Fact]
    public void Chung_4050NeverOpenInPhase1()
    {
        var state = VeDichTurn.CreateVeDich(Pool, [Player("a", 0)]);
        Assert.Equal("INVALID_QUESTION", CodeOf(() => VeDichTurn.PickPhase1(state, "a", "50-1")));
        Assert.Equal("INVALID_QUESTION", CodeOf(() => VeDichTurn.PickPhase1(state, "a", "40-1")));
    }

    [Fact]
    public void SummitPool_DeferredPlusUnplayedChung()
    {
        var state = VeDichTurn.BeginPhase2(VeDichTurn.CreateVeDich(Pool, [Player("a", 0)]));
        Assert.Equal(Pool.Count, state.Remaining.Count);
        Assert.Equal(4, CountOf(state.Remaining, 40));
        Assert.Equal(4, CountOf(state.Remaining, 50));
        Assert.Empty(state.Deferred!);
    }

    [Fact]
    public void Phase1Scoring()
    {
        var state = VeDichTurn.CreateVeDich(Pool, [Player("a", 0)]);
        var opened = VeDichTurn.PickPhase1(state, "a", "30-1");
        var after = VeDichTurn.ResolveQuestion(opened, new Verdicts(true, null));
        Assert.Equal(30, after.Players[0].Score);

        var opened2 = VeDichTurn.PickPhase1(state, "a", "30-1");
        var after2 = VeDichTurn.ResolveQuestion(opened2, new Verdicts(false, null));
        Assert.Equal(-15, after2.Players[0].Score);
    }

    [Fact]
    public void Reveal_GatesTheQuestionAndTheBuzzRace()
    {
        var s = TwoUp();
        var a = s.Players[0].Id;
        var b = s.Players[1].Id;
        var opened = VeDichTurn.OpenPhase2Question(
            VeDichTurn.DeclarePower(s, a, PowerKind.ASSIGN, b), "40-1", Now);

        Assert.False(opened.Open!.Revealed);
        Assert.Null(opened.Open!.Window.OpenedAt);

        var revealed = VeDichTurn.RevealQuestion(opened, Now);
        Assert.True(revealed.Open!.Revealed);
        Assert.Equal(Now, revealed.Open!.Window.OpenedAt);
    }

    [Fact]
    public void Phase2_RefusesAQuestionAlreadyPlayedInPhase1()
    {
        var state = VeDichTurn.CreateVeDich(Pool, [Player("a", 0), Player("b", 0)]);
        var played = VeDichTurn.PickPhase1(state, "a", "20-1");
        var resolved = VeDichTurn.ResolveQuestion(played, new Verdicts(true, null));
        var ended = VeDichTurn.BeginPhase2(
            VeDichTurn.AdvanceTurn(VeDichTurn.AdvanceTurn(resolved)));

        Assert.DoesNotContain(ended.Remaining, q => q.Id == "20-1");
        Assert.Equal("INVALID_QUESTION", CodeOf(() =>
            VeDichTurn.PickPhase2(ended, ended.Players[0].Id, ["20-1"])));
    }

    [Fact]
    public void Phase2_TakesUpToThreeDistinctPicksAndReplacesTheSet()
    {
        var state = VeDichTurn.BeginPhase2(VeDichTurn.CreateVeDich(Pool, OrderedPlayers));

        Assert.Equal("NO_ERROR", CodeOf(() =>
            VeDichTurn.PickPhase2(state, "c", ["50-1", "40-1"])));
        Assert.Equal("INVALID_QUESTION", CodeOf(() =>
            VeDichTurn.PickPhase2(state, "c", ["50-1", "40-1", "30-1", "20-1"])));
        Assert.Equal("INVALID_QUESTION", CodeOf(() =>
            VeDichTurn.PickPhase2(state, "c", ["50-1", "50-1", "40-1"])));
        Assert.Equal("NO_ERROR", CodeOf(() =>
            VeDichTurn.PickPhase2(state, "c", ["50-1", "40-1", "30-1"])));

        var swapped = VeDichTurn.PickPhase2(
            VeDichTurn.PickPhase2(state, "c", ["50-1", "40-1"]), "c", ["50-1", "30-1"]);
        Assert.Equal(new[] { "50-1", "30-1" }, swapped.PendingPicks.Select(q => q.Id).ToList());
        Assert.Contains(swapped.Remaining, q => q.Id == "40-1");
    }

    [Fact]
    public void ConfirmPicks_MarksTheBatchAndResetsOnRepickOrTurnChange()
    {
        var picked = Picked3();
        Assert.False(picked.PicksConfirmed);

        var confirmed = VeDichTurn.ConfirmPicks(picked);
        Assert.True(confirmed.PicksConfirmed);

        Assert.Equal("NOTHING_PICKED", CodeOf(() =>
            VeDichTurn.ConfirmPicks(VeDichTurn.CreateVeDich(Pool, OrderedPlayers))));
        Assert.Equal("NOTHING_PICKED", CodeOf(() =>
            VeDichTurn.ConfirmPicks(VeDichTurn.BeginPhase2(VeDichTurn.CreateVeDich(Pool, OrderedPlayers)))));
        Assert.Equal("ALREADY_OPEN", CodeOf(() =>
            VeDichTurn.ConfirmPicks(StageOpen(picked, "c", PowerKind.STAR))));

        Assert.False(VeDichTurn.PickPhase2(confirmed, "c", ["50-1", "40-1"]).PicksConfirmed);
        Assert.False(VeDichTurn.AdvanceTurn(confirmed).PicksConfirmed);
        Assert.False(VeDichTurn.SetTurn(confirmed, "a").PicksConfirmed);
    }

    [Fact]
    public void ConfirmPicks_ClosesTheChungBoardWithoutOpeningAnything()
    {
        var s = Phase1("a", "b");
        var ids = s.Remaining.Where(q => q.Value == 20).Take(2).Select(q => q.Id).ToList();

        var picked = VeDichTurn.PickRound(s, ids);
        Assert.False(picked.PicksConfirmed);
        Assert.Equal(ids.Count, picked.PendingPicks.Count);

        var confirmed = VeDichTurn.ConfirmPicks(picked);
        Assert.True(confirmed.PicksConfirmed);
        Assert.Null(confirmed.Open);
        Assert.Equal(1, confirmed.Phase);
        Assert.Equal(ids, confirmed.PendingPicks.Select(q => q.Id).ToList());

        var repicked = VeDichTurn.PickRound(confirmed, [ids[0]]);
        Assert.False(repicked.PicksConfirmed);

        var cleared = VeDichTurn.ClearPicks(confirmed);
        Assert.False(cleared.PicksConfirmed);
        Assert.Empty(cleared.PendingPicks);
    }

    [Fact]
    public void Phase2_BuzzWindowOpensAfterCurrentAnswer()
    {
        var state = Picked3();
        state = VeDichTurn.OpenPhase2Question(state, "50-1");
        state = VeDichTurn.CloseCurrentAnswer(state, Now);
        Assert.Equal(AnswerMode.Buzz, state.Open!.Window.Mode);
    }

    [Fact]
    public void Phase2_FastestBuzzerAnswers()
    {
        var state = Picked3();
        state = VeDichTurn.CloseCurrentAnswer(VeDichTurn.OpenPhase2Question(state, "50-1"), Now);
        state = VeDichTurn.Buzz(state, "a", Now);
        Assert.Equal("a", state.Open!.Window.Buzzer);
        Assert.Equal("ALREADY_OPEN", CodeOf(() => VeDichTurn.Buzz(state, "b", Now)));
    }

    [Fact]
    public void Phase2_CurrentPlayerCannotBuzzOwnQuestion()
    {
        var state = Picked3();
        state = VeDichTurn.CloseCurrentAnswer(VeDichTurn.OpenPhase2Question(state, "50-1"), Now);
        Assert.Equal("NOT_YOUR_TURN", CodeOf(() => VeDichTurn.Buzz(state, "c", Now)));
    }

    [Fact]
    public void Phase2_CannotResolveBeforeBuzzWindow()
    {
        var state = Picked3();
        state = VeDichTurn.OpenPhase2Question(state, "50-1");
        Assert.Equal("ALREADY_OPEN", CodeOf(() =>
            VeDichTurn.ResolveQuestion(state, new Verdicts(true, null))));
    }

    [Fact]
    public void Phase2_BothCorrectPayFaceValue()
    {
        var state = Picked3();
        state = VeDichTurn.Buzz(
            VeDichTurn.CloseCurrentAnswer(VeDichTurn.OpenPhase2Question(state, "50-1"), Now), "a", Now);
        state = VeDichTurn.ResolveQuestion(state, new Verdicts(true, true));
        Assert.Equal(60, state.Players.First(p => p.Id == "c").Score);
        Assert.Equal(90, state.Players.First(p => p.Id == "a").Score);
    }

    [Fact]
    public void Phase2_CurrentWrongBuzzerRight()
    {
        var state = Picked3();
        state = VeDichTurn.Buzz(
            VeDichTurn.CloseCurrentAnswer(VeDichTurn.OpenPhase2Question(state, "50-1"), Now), "a", Now);
        state = VeDichTurn.ResolveQuestion(state, new Verdicts(false, true));
        Assert.Equal(-15, state.Players.First(p => p.Id == "c").Score);
        Assert.Equal(90, state.Players.First(p => p.Id == "a").Score);
    }

    [Fact]
    public void Phase2_BuzzerVerdictRequiredWhenBuzzedForbiddenWhenNot()
    {
        var withBuzz = Picked3();
        var buzzing = VeDichTurn.Buzz(
            VeDichTurn.CloseCurrentAnswer(VeDichTurn.OpenPhase2Question(withBuzz, "50-1"), Now), "a", Now);
        Assert.Equal("NOT_YOUR_TURN", CodeOf(() =>
            VeDichTurn.ResolveQuestion(buzzing, new Verdicts(true, null))));

        var noBuzz = Picked3();
        noBuzz = VeDichTurn.CloseCurrentAnswer(VeDichTurn.OpenPhase2Question(noBuzz, "50-1"), Now);
        Assert.Equal("NOT_YOUR_TURN", CodeOf(() =>
            VeDichTurn.ResolveQuestion(noBuzz, new Verdicts(true, true))));
    }

    [Fact]
    public void Phase2_NoDeclarationMidQuestion()
    {
        var state = Picked3();
        state = VeDichTurn.OpenPhase2Question(state, "50-1");
        state = VeDichTurn.CloseCurrentAnswer(state, Now);
        state = VeDichTurn.Buzz(state, "a", Now);
        Assert.Equal("ALREADY_OPEN", CodeOf(() => VeDichTurn.DeclarePower(state, "a", PowerKind.STAR)));
        Assert.Equal("ALREADY_OPEN", CodeOf(() => VeDichTurn.DeclarePower(state, "c", PowerKind.STAR)));
    }

    [Fact]
    public void Phase2_AdvanceTurnClearsPendingPicks()
    {
        var state = Picked3();
        state = VeDichTurn.ResolveQuestion(
            VeDichTurn.CloseCurrentAnswer(VeDichTurn.OpenPhase2Question(state, "50-1"), Now),
            new Verdicts(true, null));
        var next = VeDichTurn.AdvanceTurn(state);
        Assert.Equal(1, next.TurnIndex);
        Assert.Empty(next.PendingPicks);
    }

    [Fact]
    public void Phase2_SetTurnMovesToThePickedPlayerAndGivesBackTheirPicks()
    {
        var s = Picked3();
        Assert.Equal("c", VeDichTurn.CurrentPlayer(s).Id);

        var next = VeDichTurn.SetTurn(s, "a");
        Assert.Equal("a", VeDichTurn.CurrentPlayer(next).Id);
        Assert.Empty(next.PendingPicks);
        Assert.Contains(next.Remaining, q => q.Id == "50-1");
        Assert.Contains(next.Remaining, q => q.Id == "40-1");
        Assert.Contains(next.Remaining, q => q.Id == "30-1");

        Assert.Equal(next.PendingPicks, VeDichTurn.SetTurn(next, "a").PendingPicks);
    }

    [Fact]
    public void Phase2_SetTurnRecordsTheSeatEvenWhenItIsAlreadyTheCurrentOne()
    {
        var s = VeDichTurn.BeginPhase2(VeDichTurn.CreateVeDich(Pool, [Player("a", 0), Player("b", 0)]));
        Assert.Null(s.SelectedPlayerId);

        var chosen = VeDichTurn.SetTurn(s, s.Players[0].Id);

        Assert.Equal(s.Players[0].Id, chosen.SelectedPlayerId);
        Assert.Equal(0, chosen.TurnIndex);
    }

    [Fact]
    public void Phase2_SetTurnDropsTheLeavingPlayersStagedPower()
    {
        var s = VeDichTurn.DeclarePower(Picked3(), "c", PowerKind.STAR);
        Assert.NotNull(s.Players[s.TurnIndex].Powers.Staged);

        var next = VeDichTurn.SetTurn(s, "a");
        Assert.Null(next.Players[next.TurnIndex].Powers.Staged);
        Assert.False(next.Players[next.TurnIndex].Powers.UsedThisTurn);
    }

    [Fact]
    public void Phase2_TurnPickedRemembersTheBatchWhileQuestionsOpen()
    {
        var s = Picked3();
        Assert.Equal(3, s.TurnPicked);

        var opened = VeDichTurn.OpenPhase2Question(s, "50-1");
        Assert.Equal(2, opened.PendingPicks.Count);
        Assert.Equal(3, opened.TurnPicked);

        Assert.Equal(0, VeDichTurn.SetTurn(s, "a").TurnPicked);
        var settled = VeDichTurn.ResolveQuestion(
            VeDichTurn.CloseCurrentAnswer(opened, Now), new Verdicts(true, null));
        Assert.Equal(0, VeDichTurn.AdvanceTurn(settled).TurnPicked);
    }

    [Fact]
    public void Phase2_SetTurnRefusals()
    {
        var open = VeDichTurn.OpenPhase2Question(Picked3(), "50-1");
        Assert.Equal("ALREADY_OPEN", CodeOf(() => VeDichTurn.SetTurn(open, "a")));

        Assert.Equal("INVALID_PLAYER", CodeOf(() => VeDichTurn.SetTurn(Picked3(), "stranger")));

        var chung = VeDichTurn.PickPhase1(
            VeDichTurn.CreateVeDich(Pool, [Player("a", 0), Player("b", 0)]), "a", "30-1");
        Assert.Equal("WRONG_PHASE", CodeOf(() => VeDichTurn.SetTurn(chung, "b")));
    }

    [Fact]
    public void PickRound_TakesOneQuestionPerPlayerAndOpensNothing()
    {
        var s = Phase1("a", "b");
        var before = s.Remaining.Count;
        var ids = s.Remaining.Where(q => q.Value == 20 || q.Value == 30).Take(2).Select(q => q.Id).ToList();

        var picked = VeDichTurn.PickRound(s, ids);

        Assert.Equal(2, picked.PendingPicks.Count);
        Assert.Null(picked.Open);
        Assert.Equal(before - 2, picked.Remaining.Count);
    }

    [Fact]
    public void PickRound_TakesAtMostOnePerPlayerAndReplacesTheSet()
    {
        var s = Phase1("a", "b");
        var twenty = s.Remaining.First(q => q.Value == 20).Id;
        var forty = Cell(40, 99);
        var withForty = s with { Remaining = [.. s.Remaining, forty] };

        Assert.Equal("NO_ERROR", CodeOf(() => VeDichTurn.PickRound(s, [twenty])));
        var three = s.Remaining.Where(q => q.Value == 20 || q.Value == 30)
            .Take(3).Select(q => q.Id).ToList();
        Assert.Equal("WRONG_COUNT", CodeOf(() => VeDichTurn.PickRound(s, three)));
        Assert.Equal("INVALID_QUESTION", CodeOf(() => VeDichTurn.PickRound(s, [twenty, twenty])));
        Assert.Equal("INVALID_QUESTION", CodeOf(() => VeDichTurn.PickRound(withForty, [twenty, forty.Id])));

        var other = s.Remaining.First(q => q.Value == 20 && q.Id != twenty).Id;
        var second = VeDichTurn.PickRound(VeDichTurn.PickRound(s, [twenty]), [other]);
        Assert.Equal(new[] { other }, second.PendingPicks.Select(q => q.Id).ToList());
        Assert.Contains(second.Remaining, q => q.Id == twenty);
    }

    [Fact]
    public void NextQuestion_PlaysThePicksOneAtATimeThenClosesTheSet()
    {
        var s = Phase1("a", "b");
        var ids = s.Remaining.Where(q => q.Value == 20).Take(2).Select(q => q.Id).ToList();
        s = VeDichTurn.PickRound(s, ids);

        var first = VeDichTurn.NextQuestion(s);
        Assert.Equal(ids[0], first.Open!.Question.Id);
        Assert.Equal("", first.Open!.Answerer);
        Assert.False(first.Open!.Revealed);
        Assert.Null(first.Open!.Window.OpenedAt);
        Assert.Single(first.PendingPicks);

        var second = VeDichTurn.NextQuestion(first);
        Assert.Equal(ids[1], second.Open!.Question.Id);
        Assert.Empty(second.PendingPicks);

        var finished = VeDichTurn.NextQuestion(second);
        Assert.Null(finished.Open);
        Assert.Equal("NO_PICKS", CodeOf(() => VeDichTurn.NextQuestion(finished)));
    }

    [Fact]
    public void ClearPicks_ReturnsTheQuestionsToTheBoard()
    {
        var s = Phase1("a", "b");
        var before = s.Remaining.Count;
        var ids = s.Remaining.Where(q => q.Value == 20).Take(2).Select(q => q.Id).ToList();

        var cleared = VeDichTurn.ClearPicks(VeDichTurn.PickRound(s, ids));

        Assert.Empty(cleared.PendingPicks);
        Assert.Equal(before, cleared.Remaining.Count);
    }
}
