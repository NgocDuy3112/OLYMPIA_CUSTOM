using AOC.Domain.Contracts;
using AOC.Domain.Gameplay;
using AOC.Domain.Gameplay.Turns;
using Xunit;

namespace AOC.Tests.Modules;

public class VeDichCapabilitiesTests
{
    private const string Now = "2026-01-01T00:00:00.000Z";
    private const string Later = "2026-01-01T00:00:31.000Z";

    private static List<VeDichQuestion> Board() =>
        [.. Cells(20, 6), .. Cells(30, 6), .. Cells(40, 4), .. Cells(50, 4)];

    private static VeDichQuestion Question(string id, int value) => new() { Id = id, Value = value };

    private static List<VeDichQuestion> Cells(int value, int count)
    {
        var list = new List<VeDichQuestion>();
        for (var i = 1; i <= count; i++) list.Add(Question($"{value}-{i}", value));
        return list;
    }

    private static VeDichState Phase2(params (string Id, int Score)[] players)
        => VeDichTurn.BeginPhase2(VeDichTurn.CreateVeDich(
            Board(),
            players.Select(p => new VeDichPlayerState
            {
                Id = p.Id,
                Score = p.Score,
                Powers = PowerSet.Fresh()
            }).ToList()));

    private static VeDichState Phase2Open(string turnPlayerId = "a")
    {
        var state = Phase2(("a", 0), ("b", 0));
        state = VeDichTurn.PickPhase2(state, turnPlayerId, ["40-1"]);
        return VeDichTurn.OpenPhase2Question(state, "40-1", Now);
    }

    private static VeDichState Revealed()
        => VeDichTurn.RevealQuestion(Phase2Open(), Now);

    private static VeDichState Clocked()
        => VeDichTurn.StartClock(Revealed(), Now);

    private static VeDichState BuzzWindow()
        => VeDichTurn.CloseCurrentAnswer(Clocked(), Later);

    private static VeDichState Phase1Open()
    {
        var state = VeDichTurn.CreateVeDich(Board(), [
            new VeDichPlayerState { Id = "a", Score = 0, Powers = PowerSet.Fresh() },
            new VeDichPlayerState { Id = "b", Score = 0, Powers = PowerSet.Fresh() }
        ]);
        state = VeDichTurn.ConfirmPicks(VeDichTurn.PickRound(state, ["20-1", "20-2"]));
        return VeDichTurn.OpenPending(state, "20-1");
    }

    [Fact]
    public void A_question_nobody_opened_yet_can_be_opened()
    {
        var state = VeDichTurn.PickPhase2(Phase2(("a", 0), ("b", 0)), "a", ["40-1"]);

        var caps = VeDichTurn.Capabilities(state, Now);

        Assert.True(caps.CanOpenQuestion);
        Assert.False(caps.CanReveal);
        Assert.False(caps.CanStartClock);
        Assert.False(caps.CanLockBuzz);
        Assert.False(caps.CanResolve);
    }

    [Fact]
    public void A_fresh_question_can_be_swapped_but_not_revealed_by_the_console_yet()
    {
        var caps = VeDichTurn.Capabilities(Phase2Open(), Now);

        Assert.False(caps.CanOpenQuestion);
        Assert.True(caps.CanSwitchQuestion);
        Assert.True(caps.CanReveal);
        Assert.False(caps.CanStartClock);
    }

    [Fact]
    public void A_revealed_question_stops_being_swappable_and_accepts_its_clock()
    {
        var caps = VeDichTurn.Capabilities(Revealed(), Now);

        Assert.False(caps.CanSwitchQuestion);
        Assert.False(caps.CanReveal);
        Assert.True(caps.CanStartClock);
    }

    [Fact]
    public void A_running_clock_cannot_start_again_and_cannot_be_closed_yet()
    {
        var caps = VeDichTurn.Capabilities(Clocked(), Now);

        Assert.False(caps.CanStartClock);
        Assert.False(caps.CanCloseCurrentAnswer);
        Assert.False(caps.CanLockBuzz);
    }

    [Fact]
    public void A_finished_clock_can_be_closed_into_the_buzz_window()
    {
        var caps = VeDichTurn.Capabilities(Clocked(), Later);

        Assert.True(caps.CanCloseCurrentAnswer);
    }

    [Fact]
    public void The_buzz_window_can_be_locked_until_someone_buzzes()
    {
        var open = VeDichTurn.Capabilities(BuzzWindow(), Later);

        Assert.True(open.CanLockBuzz);
        Assert.False(open.CanCloseCurrentAnswer);

        var buzzed = VeDichTurn.Buzz(BuzzWindow(), "b", Later);
        Assert.False(VeDichTurn.Capabilities(buzzed, Later).CanLockBuzz);
    }

    [Fact]
    public void A_power_can_be_stored_only_while_the_turn_has_picks_and_no_open_question()
    {
        var state = VeDichTurn.PickPhase2(Phase2(("a", 0), ("b", 0)), "a", ["40-1"]);

        Assert.True(VeDichTurn.Capabilities(state, Now).CanStorePower);
        Assert.False(VeDichTurn.Capabilities(state, Now).CanUnstagePower);

        Assert.False(VeDichTurn.Capabilities(Phase2Open(), Now).CanStorePower);
        Assert.False(VeDichTurn.Capabilities(
            VeDichTurn.PickPhase2(Phase2(("a", 0), ("b", 0)), "a", []), Now).CanStorePower);
    }

    [Fact]
    public void A_staged_power_can_be_cancelled_until_it_is_spent()
    {
        var staged = VeDichTurn.DeclarePower(
            VeDichTurn.PickPhase2(Phase2(("a", 0), ("b", 0)), "a", ["40-1"]),
            "a", PowerKind.STAR);

        var withStaged = VeDichTurn.Capabilities(staged, Now);
        Assert.False(withStaged.CanStorePower);
        Assert.True(withStaged.CanUnstagePower);

        var cancelled = VeDichTurn.Capabilities(VeDichTurn.DeclarePower(staged, "a", null), Now);
        Assert.True(cancelled.CanStorePower);
        Assert.False(cancelled.CanUnstagePower);

        var spent = VeDichTurn.Capabilities(
            VeDichTurn.OpenPhase2Question(staged, "40-1", Now), Now);
        Assert.False(spent.CanStorePower);
        Assert.False(spent.CanUnstagePower);
    }

    [Fact]
    public void A_spent_power_set_offers_no_declaration_on_the_next_turn()
    {
        var state = VeDichTurn.PickPhase2(Phase2(("a", 0), ("b", 0)), "a", ["40-1"]);
        state = VeDichTurn.DeclarePower(state, "a", PowerKind.STAR);
        state = VeDichTurn.OpenPhase2Question(state, "40-1", Now);
        state = VeDichTurn.RevealQuestion(state, Now);
        state = VeDichTurn.StartClock(state, Now);
        state = VeDichTurn.CloseCurrentAnswer(state, Later);
        state = VeDichTurn.ResolveQuestion(state, new Verdicts(true, null), Later);
        state = VeDichTurn.PickPhase2(state, "a", ["40-2"]);

        var caps = VeDichTurn.Capabilities(state, Now);

        Assert.False(caps.CanStorePower);
    }

    [Fact]
    public void An_assigned_race_must_settle_before_the_turn_can_be_resolved()
    {
        var state = VeDichTurn.PickPhase2(Phase2(("a", 0), ("b", 0)), "a", ["40-1"]);
        var racing = VeDichTurn.RevealQuestion(VeDichTurn.OpenPhase2Question(
            VeDichTurn.DeclarePower(state, "a", PowerKind.ASSIGN, "b"), "40-1", Now), Now);

        Assert.False(VeDichTurn.Capabilities(racing, Now).CanResolve);

        var locked = VeDichTurn.LockBuzzWindow(racing);
        Assert.True(VeDichTurn.Capabilities(locked, Later).CanResolve);
    }

    [Fact]
    public void An_oral_question_is_closed_before_it_can_be_resolved()
    {
        Assert.False(VeDichTurn.Capabilities(Revealed(), Now).CanResolve);
        Assert.False(VeDichTurn.Capabilities(Clocked(), Later).CanResolve);
        Assert.True(VeDichTurn.Capabilities(BuzzWindow(), Later).CanResolve);
    }

    [Fact]
    public void Answering_needs_a_started_unlocked_typed_window()
    {
        var open = Phase1Open();
        Assert.False(VeDichTurn.CanAnswer(open, "a"));

        var clocked = VeDichTurn.StartClock(VeDichTurn.RevealQuestion(open, Now), Now);
        Assert.True(VeDichTurn.CanAnswer(clocked, "a"));
        Assert.True(VeDichTurn.CanAnswer(clocked, "b"));
    }

    [Fact]
    public void Buzzing_needs_an_open_window_and_an_eligible_player()
    {
        var open = BuzzWindow();

        Assert.True(VeDichTurn.CanBuzz(open, "b", Later));
        Assert.False(VeDichTurn.CanBuzz(open, "a", Later));

        var buzzed = VeDichTurn.Buzz(open, "b", Later);
        Assert.False(VeDichTurn.CanBuzz(buzzed, "a", Later));
    }
}
