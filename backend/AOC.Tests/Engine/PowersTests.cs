using AOC.Domain.Contracts;
using AOC.Domain.Gameplay.Turns;
using Xunit;

namespace AOC.Tests.Engine;

public class PowersTests
{
    private static string CodeOf(Action fn)
    {
        try
        {
            fn();
        }
        catch (RuleError e)
        {
            return e.Code;
        }
        return "NO_ERROR";
    }

    [Fact]
    public void FreshSetHoldsOneOfEachPower()
    {
        var powers = PowerSet.Fresh();

        Assert.Equal([PowerKind.STAR, PowerKind.ASSIGN], powers.Available);
        Assert.False(powers.UsedThisTurn);
        Assert.Null(powers.Staged);
    }

    [Fact]
    public void StagingAStarNeedsNoTarget()
    {
        var staged = PowerSet.Fresh().Stage(PowerKind.STAR, null);

        Assert.True(staged.UsedThisTurn);
        Assert.Equal(PowerKind.STAR, staged.Staged!.Power);
        Assert.Null(staged.Staged.TargetId);
    }

    [Fact]
    public void StagingAnAssignKeepsTheTarget()
    {
        var staged = PowerSet.Fresh().Stage(PowerKind.ASSIGN, "b");

        Assert.Equal(PowerKind.ASSIGN, staged.Staged!.Power);
        Assert.Equal("b", staged.Staged.TargetId);
    }

    [Fact]
    public void AssignWithoutATargetIsRefused()
    {
        Assert.Equal("INVALID_TARGET",
            CodeOf(() => PowerSet.Fresh().Stage(PowerKind.ASSIGN, null)));
    }

    [Fact]
    public void OnePowerPerTurn()
    {
        var staged = PowerSet.Fresh().Stage(PowerKind.STAR, null);

        Assert.Equal("ONE_POWER_PER_TURN",
            CodeOf(() => staged.Stage(PowerKind.ASSIGN, "b")));
    }

    [Fact]
    public void ASpentPowerIsGoneForTheTurn()
    {
        var spent = PowerSet.Fresh().Spend(PowerKind.STAR);

        // One power per turn: the other one does not become available.
        Assert.Empty(spent.Available);
        Assert.Equal("POWER_UNAVAILABLE", CodeOf(() => spent.Spend(PowerKind.STAR)));
        Assert.Equal("POWER_UNAVAILABLE", CodeOf(() => spent.Spend(PowerKind.ASSIGN)));
        Assert.Equal("POWER_UNAVAILABLE", CodeOf(() => spent.Stage(PowerKind.STAR, null)));
        Assert.Equal("POWER_UNAVAILABLE", CodeOf(() => spent.Stage(PowerKind.ASSIGN, "b")));
    }

    [Fact]
    public void SpendingDoesNotRefundTheTurn()
    {
        var staged = PowerSet.Fresh().Stage(PowerKind.ASSIGN, "b");
        var spent = staged.Spend(PowerKind.ASSIGN);

        Assert.True(spent.UsedThisTurn);
        Assert.Empty(spent.Available);
    }

    [Fact]
    public void ClearTurnPreparesTheNextQuestion()
    {
        var next = PowerSet.Fresh().Stage(PowerKind.STAR, null).ClearTurn();

        Assert.False(next.UsedThisTurn);
        Assert.Null(next.Staged);
        Assert.Equal([PowerKind.STAR, PowerKind.ASSIGN], next.Available);
    }

    [Fact]
    public void ANextTurnReArmsTheFullSet()
    {
        var spent = PowerSet.Fresh().Stage(PowerKind.STAR, null)
            .Spend(PowerKind.STAR).ClearTurn();
        Assert.Empty(spent.Available);

        var next = spent.ResetForTurn();

        Assert.Equal([PowerKind.STAR, PowerKind.ASSIGN], next.Available);
        Assert.False(next.UsedThisTurn);
        Assert.Null(next.Staged);
    }

    [Fact]
    public void UnstagingHandsTheTurnPowerBack()
    {
        var staged = PowerSet.Fresh().Stage(PowerKind.STAR, null);

        var back = staged.Unstage();

        Assert.Null(back.Staged);
        Assert.False(back.UsedThisTurn);
        Assert.Equal([PowerKind.STAR, PowerKind.ASSIGN], back.Available);
        Assert.Equal(PowerKind.ASSIGN, back.Stage(PowerKind.ASSIGN, "b").Staged!.Power);
    }
}
