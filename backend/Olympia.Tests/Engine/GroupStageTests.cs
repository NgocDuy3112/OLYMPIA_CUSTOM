using Olympia.Domain.Engine.Scoring;
using Xunit;

namespace Olympia.Tests.Engine;

public class GroupStageTests
{
    [Fact]
    public void PhaseOfStage_MapsOnlyTheTwoGroupStages()
    {
        Assert.Equal(GroupStage.GroupPhase.Phase1, GroupStage.PhaseOfStage("phase-1"));
        Assert.Equal(GroupStage.GroupPhase.Phase2, GroupStage.PhaseOfStage("phase-2"));
        Assert.Null(GroupStage.PhaseOfStage("playin-1"));
        Assert.Null(GroupStage.PhaseOfStage("playoff-1"));
        Assert.Null(GroupStage.PhaseOfStage("final"));
    }

    [Fact]
    public void TeamPointsFor_PaysExactlyTheDrawnScale()
    {
        Assert.Equal(2, GroupStage.TeamPointsFor(GroupStage.GroupPhase.Phase1, 3, 1));
        Assert.Equal(0, GroupStage.TeamPointsFor(GroupStage.GroupPhase.Phase1, 3, 2));
        Assert.Equal(3, GroupStage.TeamPointsFor(GroupStage.GroupPhase.Phase1, 4, 1));
        Assert.Equal(1, GroupStage.TeamPointsFor(GroupStage.GroupPhase.Phase1, 4, 2));
        Assert.Equal(0, GroupStage.TeamPointsFor(GroupStage.GroupPhase.Phase1, 4, 3));
        Assert.Equal(1, GroupStage.TeamPointsFor(GroupStage.GroupPhase.Phase2, 3, 1));
        Assert.Equal(2, GroupStage.TeamPointsFor(GroupStage.GroupPhase.Phase2, 4, 1));
        Assert.Equal(0, GroupStage.TeamPointsFor(GroupStage.GroupPhase.Phase2, 4, 2));
    }

    [Fact]
    public void TeamPointsFor_PaysNothingOutsideTheTable()
    {
        Assert.Equal(0, GroupStage.TeamPointsFor(GroupStage.GroupPhase.Phase1, 2, 1));
        Assert.Equal(0, GroupStage.TeamPointsFor(GroupStage.GroupPhase.Phase1, 4, 0));
        Assert.Equal(0, GroupStage.TeamPointsFor(GroupStage.GroupPhase.Phase1, 4, 9));
    }

    [Fact]
    public void CountedScore_ClampsNegativePhase1()
    {
        Assert.Equal(0, GroupStage.CountedScore(GroupStage.GroupPhase.Phase1, -8));
        Assert.Equal(-8, GroupStage.CountedScore(GroupStage.GroupPhase.Phase2, -8));
        Assert.Equal(12, GroupStage.CountedScore(GroupStage.GroupPhase.Phase1, 12));
    }

    [Fact]
    public void Averages_OverMatchesPlayedPerPhaseAndPooled()
    {
        var avg = GroupStage.ComputeAverages(
        [
            new GroupStage.PlayedMatch(GroupStage.GroupPhase.Phase1, 10),
            new GroupStage.PlayedMatch(GroupStage.GroupPhase.Phase1, -6), // counted as 0 in Phase 1
            new GroupStage.PlayedMatch(GroupStage.GroupPhase.Phase2, 20)
        ]);
        Assert.Equal(5, avg.Phase1);
        Assert.Equal(20, avg.Phase2);
        Assert.Equal(10, avg.All);
    }

    [Fact]
    public void Averages_NoAverageForEmptyScope()
    {
        var empty = GroupStage.ComputeAverages([]);
        Assert.Null(empty.Phase1);
        Assert.Null(empty.Phase2);
        Assert.Null(empty.All);

        var phase2Only = GroupStage.ComputeAverages(
            [new GroupStage.PlayedMatch(GroupStage.GroupPhase.Phase2, 5)]);
        Assert.Null(phase2Only.Phase1);
    }

    private static readonly Dictionary<string, GroupStage.GroupLabel> Roster = new()
    {
        ["u1"] = GroupStage.GroupLabel.A,
        ["u2"] = GroupStage.GroupLabel.A,
        ["u3"] = GroupStage.GroupLabel.B,
        ["u4"] = GroupStage.GroupLabel.B,
        ["idle"] = GroupStage.GroupLabel.A
    };

    private static readonly List<GroupStage.GroupMatchInput> Matches =
    [
        new(GroupStage.GroupPhase.Phase1,
        [
            new("u1", 1, 40), new("u2", 2, 30), new("u3", 3, 20), new("u4", 4, 10)
        ]),
        new(GroupStage.GroupPhase.Phase2,
        [
            new("u3", 1, 25), new("u1", 2, 15), new("u4", 3, -5)
        ])
    ];

    [Fact]
    public void Standings_BanksPointsByFinishingOrder()
    {
        var t = GroupStage.Build(Roster, Matches);
        Assert.Equal(4, t.ByGroup[GroupStage.GroupLabel.A].TeamPoints);
        Assert.Equal(1, t.ByGroup[GroupStage.GroupLabel.B].TeamPoints);

        var u1 = t.ByGroup[GroupStage.GroupLabel.A].Contestants.First(c => c.UserId == "u1");
        Assert.Equal(3, u1.BankedPoints);
        Assert.Equal(2, u1.MatchesPlayed);
        Assert.Equal(1, t.ByGroup[GroupStage.GroupLabel.A].Contestants
            .First(c => c.UserId == "u2").BankedPoints);
    }

    [Fact]
    public void Standings_OrdersGroupAndSitsNeverPlayedLast()
    {
        var t = GroupStage.Build(Roster, Matches);
        Assert.Equal(["u1", "u2", "idle"],
            t.ByGroup[GroupStage.GroupLabel.A].Contestants.Select(c => c.UserId));
    }

    [Fact]
    public void Standings_GrouplessContestantsLeftOut()
    {
        var t = GroupStage.Build(Roster,
            [new(GroupStage.GroupPhase.Phase1, [new("stranger", 1, 99)])]);
        Assert.Equal(0, t.ByGroup[GroupStage.GroupLabel.A].TeamPoints);
        Assert.Equal(0, t.ByGroup[GroupStage.GroupLabel.B].TeamPoints);
    }

    [Fact]
    public void Wildcard_HoldsOnlyPlayersWhoPlayedBestAvgFirst()
    {
        var t = GroupStage.Build(Roster, Matches);
        Assert.Equal(
            new (string, double)[] { ("u2", 30), ("u1", 27.5), ("u3", 22.5), ("u4", 2.5) },
            t.Wildcard.Select(w => (w.Line.UserId, w.Avg)));
        Assert.DoesNotContain(t.Wildcard, w => w.Line.UserId == "idle");
    }
}
