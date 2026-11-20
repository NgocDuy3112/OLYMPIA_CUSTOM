using AOC.Api.Modules.Live.TieBreak;
using AOC.Domain.Contracts;
using AOC.Domain.Gameplay.Turns;
using AOC.Infrastructure.Data;
using AOC.Infrastructure.Data.Entities;
using Xunit;

namespace AOC.Tests.Modules;

public class TieBreakViewTests
{
    private const string T0 = "2026-01-01T00:00:00.000Z";

    private static readonly Guid Q1 = Guid.NewGuid();
    private static readonly Guid Q2 = Guid.NewGuid();

    private static readonly Dictionary<string, string> Names = new()
    {
        ["a"] = "An",
        ["b"] = "Bình"
    };

    private static TieBreakState Started()
        => TieBreakTurn.StartTieBreak(["a", "b"], [Q1.ToString(), Q2.ToString()]);

    private static QuestionBankEntity Bank(Guid id, string text)
        => new()
        {
            Id = id,
            Kind = QuestionKind.KEYWORD,
            QuestionText = text,
            Payload = JsonDefaults.Serialize(new QuestionPayload.Keyword("ABC"))
        };

    private static Dictionary<string, QuestionBankEntity> Questions()
        => new()
        {
            [Q1.ToString()] = Bank(Q1, "Câu một"),
            [Q2.ToString()] = Bank(Q2, "Câu hai")
        };

    [Fact]
    public void OpenWindowShowsTheCurrentQuestionAndBothPlayers()
    {
        var state = TieBreakTurn.OpenBuzz(Started(), T0);

        var view = TieBreakViews.Build("m1", 4, state, T0, Questions(), Names, "a");

        Assert.Equal("tiebreak", view.Stage);
        Assert.Equal(Q1.ToString(), view.QuestionId);
        Assert.True(view.WindowOpen);
        Assert.Equal("Câu một", view.Question?.QuestionText);
        Assert.Equal(["a", "b"], view.Players.Select(p => p.Id));
        Assert.Equal("An", view.Me?.DisplayName);
        Assert.Equal("2026-01-01T00:00:05.000Z", view.DeadlineAt);
    }

    [Fact]
    public void CorrectBuzzMovesToTheNextQuestionAndKeepsTheScore()
    {
        var state = TieBreakTurn.Judge(
            TieBreakTurn.Buzz(TieBreakTurn.OpenBuzz(Started(), T0), "b", T0), correct: true);

        var view = TieBreakViews.Build("m1", 5, state, T0, Questions(), Names, "b");

        Assert.Equal(Q2.ToString(), view.QuestionId);
        Assert.Equal(10, view.Me?.Points);
        Assert.Equal(1, view.Me?.Rank);
        Assert.False(view.WindowOpen);
    }

    [Fact]
    public void EndedTieBreakHasNoCurrentQuestion()
    {
        var state = TieBreakTurn.EndTieBreak(Started());

        var view = TieBreakViews.Build("m1", 6, state, T0, Questions(), Names, null);

        Assert.True(view.Ended);
        Assert.Null(view.QuestionId);
        Assert.Null(view.Question);
        Assert.Null(view.Me);
    }
}
