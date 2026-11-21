using AOC.Api.Modules.Questions;
using Xunit;

namespace AOC.Tests.Modules;

public class BucketSlotTests
{
    [Fact]
    public void PointlessTurnMatchesByTurnRegardlessOfSlotPoints()
    {
        var bucket = Buckets.ExpectedBucketForSlot(new Buckets.Slot("khoi-dong", "phase1", 10));
        Assert.Equal("khoi-dong:rieng", bucket);
    }

    [Fact]
    public void PointlessTurnStillMatchesWithoutPoints()
    {
        var bucket = Buckets.ExpectedBucketForSlot(new Buckets.Slot("khoi-dong", "phase1", null));
        Assert.Equal("khoi-dong:rieng", bucket);
    }

    [Fact]
    public void PointedTurnStillMatchesByPoints()
    {
        var bucket = Buckets.ExpectedBucketForSlot(new Buckets.Slot("ve-dich", "phase1", 30));
        Assert.Equal("ve-dich:30", bucket);
    }
}
