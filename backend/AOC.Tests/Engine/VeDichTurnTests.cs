using AOC.Domain.Contracts;
using AOC.Domain.Gameplay;
using AOC.Domain.Gameplay.Turns;
using Xunit;

namespace AOC.Tests.Engine;

public partial class VeDichTurnTests
{
    private const string Now = "2026-01-01T00:00:00.000Z";

    private static string At(double sec) =>
        DateTimeOffset.Parse(Now).AddMilliseconds((long)(sec * 1000)).UtcDateTime
            .ToString("yyyy-MM-ddTHH:mm:ss.fffZ");

    private static VeDichQuestion Cell(int value, int n)
        => new() { Id = $"{value}-{n}", Value = value };

    private static List<VeDichQuestion> Cells(int value, int count)
        => Enumerable.Range(1, count).Select(n => Cell(value, n)).ToList();

    private static List<VeDichQuestion> Board() =>
    [
        .. Cells(20, 6), .. Cells(30, 6), .. Cells(40, 4), .. Cells(50, 4)
    ];

    private static readonly List<VeDichQuestion> Pool = Board();

    private static int CountOf(IEnumerable<VeDichQuestion> qs, int value)
        => qs.Count(q => q.Value == value);

    private static VeDichPlayerState Player(string id, int score) => new()
    {
        Id = id,
        Score = score,
        Powers = PowerSet.Fresh()
    };

    private static string CodeOf(Action fn)
    {
        try
        {
            fn();
        }
        catch (VeDichRuleError e)
        {
            return e.Code;
        }
        return "NO_ERROR";
    }

    private static VeDichState StageOpen(VeDichState picked, string playerId, PowerKind power,
        string? targetId = null, string questionId = "40-1")
        => VeDichTurn.RevealQuestion(
            VeDichTurn.OpenPhase2Question(
                VeDichTurn.DeclarePower(picked, playerId, power, targetId), questionId, Now),
            Now);


    private static readonly List<VeDichPlayerState> OrderedPlayers =
        [Player("a", 40), Player("b", 90), Player("c", 10)];

    [Fact]
    public void TurnOrder_Phase1HighestFirst()
    {
        Assert.Equal(["b", "a", "c"],
            VeDichTurn.OrderForPhase(OrderedPlayers, 1).Select(p => p.Id));
    }

    [Fact]
    public void TurnOrder_Phase2LowestFirst()
    {
        Assert.Equal(["c", "a", "b"],
            VeDichTurn.OrderForPhase(OrderedPlayers, 2).Select(p => p.Id));
    }

    [Fact]
    public void Create_StartsInPhase1WithThatOrder()
    {
        var state = VeDichTurn.CreateVeDich(Pool, OrderedPlayers);
        Assert.Equal(1, state.Phase);
        Assert.Equal("b", state.Players[0].Id);
    }

    [Fact]
    public void Transitions_Phase1CompletesOnlyAfterTheConfirmedBatchIsPlayedOut()
    {
        var s = VeDichTurn.CreateVeDich(Pool, OrderedPlayers);
        Assert.False(VeDichTurn.Phase1Complete(s));

        var ids = s.Remaining.Where(q => q.Value == 20).Take(OrderedPlayers.Count)
            .Select(q => q.Id).ToList();
        s = VeDichTurn.PickRound(s, ids);
        Assert.False(VeDichTurn.Phase1Complete(s));
        s = VeDichTurn.ConfirmPicks(s);

        // Model A: no turn advancing — the console closes the batch question by
        // question, and phase 1 only ends when the last one is closed.
        for (var i = 0; i < ids.Count; i++)
        {
            s = ClosePlayed(s, ids[i]);
            Assert.Equal(i == ids.Count - 1, VeDichTurn.Phase1Complete(s));
        }
    }

    [Fact]
    public void Transitions_CloseQuestionRefusesAQuestionNobodySawOrClocked()
    {
        // Phase-1 asymmetry fix: closing marks the question played for good, so an
        // untouched one may not be closed (mirrors phase 2's started-question guard).
        var state = VeDichTurn.CreateVeDich(Pool, OrderedPlayers);
        var ids = state.Remaining.Where(q => q.Value == 20).Take(OrderedPlayers.Count)
            .Select(q => q.Id).ToList();
        var opened = VeDichTurn.OpenPending(
            VeDichTurn.ConfirmPicks(VeDichTurn.PickRound(state, ids)), ids[0]);

        Assert.Equal("NOT_REVEALED", CodeOf(() => VeDichTurn.CloseQuestion(opened)));

        var revealed = VeDichTurn.RevealQuestion(opened, Now);
        Assert.Equal("CLOCK_NOT_STARTED", CodeOf(() => VeDichTurn.CloseQuestion(revealed)));

        var played = VeDichTurn.CloseQuestion(VeDichTurn.StartClock(revealed, Now));
        Assert.Null(played.Open);
        Assert.Contains(played.Played, q => q.Id == opened.Open!.Question.Id);
    }

    [Fact]
    public void Transitions_OpenQuestionBlocksCompletion()
    {
        var done = Phase1Done();
        var withOpen = done with
        {
            Open = new OpenQuestion
            {
                Question = done.Remaining[0],
                Answerer = "b",
                Power = null,
                Window = AnswerWindow.OralCurrentTurn("b")
            }
        };
        Assert.False(VeDichTurn.Phase1Complete(withOpen));
    }

    [Fact]
    public void Transitions_BeginPhase2Reorders()
    {
        var s = VeDichTurn.BeginPhase2(Phase1Done());
        Assert.Equal(2, s.Phase);
        Assert.Equal(["c", "a", "b"], s.Players.Select(p => p.Id));
        Assert.Equal(0, s.TurnIndex);
        Assert.Empty(s.PendingPicks);
    }

    [Fact]
    public void Transitions_BeginPhase2SkipsUntouchedButRefusesTouched()
    {
        Assert.Equal(2, VeDichTurn.BeginPhase2(VeDichTurn.CreateVeDich(Pool, OrderedPlayers)).Phase);
        Assert.Equal("PHASE1_INCOMPLETE", CodeOf(() =>
            VeDichTurn.BeginPhase2(VeDichTurn.AdvanceTurn(VeDichTurn.CreateVeDich(Pool, OrderedPlayers)))));
    }

    [Fact]
    public void Transitions_BeginPhase2CannotRunTwice()
    {
        var s = VeDichTurn.BeginPhase2(Phase1Done());
        Assert.Equal("WRONG_PHASE", CodeOf(() => VeDichTurn.BeginPhase2(s)));
    }

    [Fact]
    public void Transitions_Phase2CompletesAfterEveryTurn()
    {
        var s = VeDichTurn.BeginPhase2(Phase1Done());
        Assert.False(VeDichTurn.Phase2Complete(s));
        for (var i = 0; i < OrderedPlayers.Count; i++)
            s = VeDichTurn.AdvanceTurn(s);
        Assert.True(VeDichTurn.Phase2Complete(s));
    }

    [Fact]
    public void Turn_AfterTheLastPlayerRefusesActionsInsteadOfCrashing()
    {
        var s = VeDichTurn.BeginPhase2(Phase1Done());
        for (var i = 0; i < OrderedPlayers.Count; i++)
            s = VeDichTurn.AdvanceTurn(s);

        Assert.Equal("NO_TURN", CodeOf(() => VeDichTurn.PickPhase2(s, "c", ["50-1"])));
        Assert.Equal("NO_TURN", CodeOf(() => VeDichTurn.DeclarePower(s, "c", PowerKind.STAR)));
    }

    [Fact]
    public void Transitions_EndVeDichClearsOpenQuestion()
    {
        var s = VeDichTurn.CreateVeDich(Pool, [Player("a", 0)]);
        s = VeDichTurn.PickPhase1(s, "a", "30-1");
        var ended = VeDichTurn.EndVeDich(s);
        Assert.True(ended.Ended);
        Assert.Null(ended.Open);
    }

    private static VeDichState Phase1Done()
    {
        // Model A: one confirmed question per player, then play the whole batch.
        var s = VeDichTurn.CreateVeDich(Pool, OrderedPlayers);
        var ids = s.Remaining.Where(q => q.Value == 20).Take(OrderedPlayers.Count)
            .Select(q => q.Id).ToList();
        s = VeDichTurn.ConfirmPicks(VeDichTurn.PickRound(s, ids));
        foreach (var id in ids)
            s = ClosePlayed(s, id);
        return s;
    }

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

    private static VeDichState Buzzing()
    {
        var s = VeDichTurn.BeginPhase2(VeDichTurn.CreateVeDich(Pool, OrderedPlayers));
        s = VeDichTurn.PickPhase2(s, "c", ["50-1", "40-1", "30-1"]);
        s = VeDichTurn.OpenPhase2Question(s, "50-1");
        return ClockRanOut(s);
    }

    /// <summary>
    /// The console's flow for a phase-2 oral question: reveal it, run the clock out,
    /// then close the answer window so the buzz window opens at <see cref="Now"/>.
    /// The clock starts far enough back that it is already spent at Now (ve-dich
    /// question clocks top out at 45 s).
    /// </summary>
    private static VeDichState ClockRanOut(VeDichState opened)
        => VeDichTurn.CloseCurrentAnswer(
            VeDichTurn.StartClock(VeDichTurn.RevealQuestion(opened, At(-60)), At(-60)), Now);

    private static (VeDichState State, string A) RiengOpen()
    {
        var s = VeDichTurn.BeginPhase2(
            VeDichTurn.CreateVeDich(Pool, [Player("a", 0), Player("b", 0)]));
        s = VeDichTurn.PickPhase2(s, s.Players[0].Id, ["40-1", "50-1", "30-1"]);
        return (s, s.Players[0].Id);
    }

    private static VeDichState TwoUp()
    {
        var s = VeDichTurn.BeginPhase2(
            VeDichTurn.CreateVeDich(Pool, [Player("a", 0), Player("b", 0), Player("c", 0)]));
        return VeDichTurn.PickPhase2(s, s.Players[0].Id, ["40-1", "50-1", "30-1"]);
    }

    private static VeDichState Picked3()
        => VeDichTurn.PickPhase2(
            VeDichTurn.BeginPhase2(VeDichTurn.CreateVeDich(Pool, OrderedPlayers)),
            "c", ["50-1", "40-1", "30-1"]);

    private static (VeDichState State, string A, string B) RiengStaged()
    {
        var s = VeDichTurn.BeginPhase2(
            VeDichTurn.CreateVeDich(Pool, [Player("a", 0), Player("b", 0)]));
        s = VeDichTurn.PickPhase2(s, s.Players[0].Id, ["40-1", "50-1", "30-1"]);
        return (s, s.Players[0].Id, s.Players[1].Id);
    }

    private static VeDichState Phase1(params string[] ids)
        => VeDichTurn.CreateVeDich(Pool, ids.Select(id => Player(id, 0)).ToList());
}
