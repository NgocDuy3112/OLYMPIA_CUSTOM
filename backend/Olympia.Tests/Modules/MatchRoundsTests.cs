using Olympia.Api.Modules.Matches;
using Olympia.Domain.Contracts;
using Xunit;

namespace Olympia.Tests.Modules;

public class MatchRoundsTests
{
    private static readonly List<TournamentRound> Season =
    [
        new() { Id = "ve-dich", Name = "Ve Dich", Order = 3, Chart = "bars" },
        new() { Id = "khoi-dong", Name = "Khoi Dong", Order = 0, Chart = "bars" },
        new() { Id = "but-pha", Name = "But Pha", Order = 2, Chart = "bars" },
        new() { Id = "giai-ma", Name = "Giai Ma", Order = 1, Chart = "bars" }
    ];

    private static RoundConfig Cfg() => new()
    {
        AllowedKinds = [QuestionKind.TEXT],
        Scoring = new ScoringRule.Constant(10),
        Turns = []
    };

    [Fact]
    public void Ordered_OrdersByTournamentOrder()
    {
        Assert.Equal(
            new[] { "khoi-dong", "giai-ma", "but-pha", "ve-dich" },
            MatchRounds.OrderedMatchRounds(Season, new Dictionary<string, RoundConfig>()));
    }

    [Fact]
    public void Ordered_PlaysAocRoundsEvenWithoutConfigs()
    {
        Assert.Equal(4, MatchRounds.OrderedMatchRounds(Season, new Dictionary<string, RoundConfig>()).Count);
    }

    [Fact]
    public void Ordered_KeepsCustomRoundOnlyWhenConfigured()
    {
        var rounds = new List<TournamentRound>(Season)
        {
            new() { Id = "custom", Name = "Custom", Order = 9, Chart = "bars" }
        };
        Assert.DoesNotContain("custom",
            MatchRounds.OrderedMatchRounds(rounds, new Dictionary<string, RoundConfig>()));
        Assert.Contains("custom",
            MatchRounds.OrderedMatchRounds(rounds, new Dictionary<string, RoundConfig> { ["custom"] = Cfg() }));
    }

    [Fact]
    public void Next_ReturnsFirstWhenNoCurrent()
    {
        Assert.Equal("giai-ma", MatchRounds.NextRoundId(["giai-ma", "but-pha"], null));
    }

    [Fact]
    public void Next_ReturnsFollowingRound()
    {
        Assert.Equal("but-pha", MatchRounds.NextRoundId(["giai-ma", "but-pha"], "giai-ma"));
    }

    [Fact]
    public void Next_ReturnsNullAtEnd()
    {
        Assert.Null(MatchRounds.NextRoundId(["giai-ma", "but-pha"], "but-pha"));
    }

    [Fact]
    public void Next_ReturnsNullForUnknownRound()
    {
        Assert.Null(MatchRounds.NextRoundId(["giai-ma"], "ve-dich"));
    }

    [Fact]
    public void Next_ReturnsNullWhenEmpty()
    {
        Assert.Null(MatchRounds.NextRoundId([], null));
    }
}
