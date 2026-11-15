using AOC.Api.Modules.Live;
using Xunit;

namespace AOC.Tests.Modules;

public class RankTableTests
{
    private static ScoreRow Row(string id, int points) => new(id, id, points);

    [Fact]
    public void KeepsTheInputOrder_ScoresChangeWithoutCardsMoving()
    {
        var table = new List<ScoreRow> { Row("a", 10), Row("b", 50), Row("c", 30) };

        var ranked = LiveView.RankTable(table);

        Assert.Equal(new[] { "a", "b", "c" }, ranked.Select(r => r.Id));
        Assert.Equal(new[] { 3, 1, 2 }, ranked.Select(r => r.Rank));
    }

    [Fact]
    public void TiesShareARank_WhileTheInputOrderStaysPut()
    {
        var table = new List<ScoreRow> { Row("a", 20), Row("b", 20), Row("c", 5) };

        var ranked = LiveView.RankTable(table);

        Assert.Equal(new[] { "a", "b", "c" }, ranked.Select(r => r.Id));
        Assert.Equal(new[] { 1, 1, 3 }, ranked.Select(r => r.Rank));
    }

    [Fact]
    public void ScoreChangesMoveTheRankNotTheSeat()
    {
        var table = new List<ScoreRow> { Row("a", 10), Row("b", 50) };

        var adjusted = LiveView.RankTable(new List<ScoreRow> { Row("a", 60), Row("b", 50) });

        Assert.Equal(new[] { "a", "b" }, adjusted.Select(r => r.Id));
        Assert.Equal(new[] { 1, 2 }, adjusted.Select(r => r.Rank));
    }

    [Fact]
    public void EmptyTableStaysEmpty()
    {
        Assert.Empty(LiveView.RankTable(null));
        Assert.Empty(LiveView.RankTable([]));
    }
}
