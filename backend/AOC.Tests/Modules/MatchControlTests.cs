using AOC.Api.Modules.Live;
using Xunit;

namespace AOC.Tests.Modules;

public class MatchControlTests
{
    private static readonly DateTime Now = new(2026, 1, 1, 12, 0, 0, DateTimeKind.Utc);

    [Fact]
    public void IsFresh_IsFalseWhenNeverHeartbeated()
    {
        Assert.False(MatchControl.IsFresh(null, Now));
    }

    [Fact]
    public void IsFresh_IsTrueInsideStaleWindow()
    {
        Assert.True(MatchControl.IsFresh(Now.AddSeconds(-10), Now));
    }

    [Fact]
    public void IsFresh_IsFalseAtStaleBoundary()
    {
        Assert.False(MatchControl.IsFresh(Now - MatchControl.StaleAfter, Now));
    }

    [Fact]
    public void CanHold_ClaimsWhenNoOneHolds()
    {
        Assert.True(MatchControl.CanHold(null, null, Guid.NewGuid(), false, Now));
    }

    [Fact]
    public void CanHold_RenewsOwnLease()
    {
        var me = Guid.NewGuid();
        Assert.True(MatchControl.CanHold(me, Now.AddSeconds(-5), me, false, Now));
    }

    [Fact]
    public void CanHold_RejectsWhenAnotherOperatorHoldsFresh()
    {
        Assert.False(MatchControl.CanHold(
            Guid.NewGuid(), Now.AddSeconds(-5), Guid.NewGuid(), false, Now));
    }

    [Fact]
    public void CanHold_StealsWhenHolderWentStale()
    {
        Assert.True(MatchControl.CanHold(
            Guid.NewGuid(), Now - MatchControl.StaleAfter, Guid.NewGuid(), false, Now));
    }

    [Fact]
    public void CanHold_TakeoverSeizesEvenAFreshHolder()
    {
        Assert.True(MatchControl.CanHold(
            Guid.NewGuid(), Now.AddSeconds(-1), Guid.NewGuid(), true, Now));
    }
}
