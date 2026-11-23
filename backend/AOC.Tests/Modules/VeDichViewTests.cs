using AOC.Api.Modules.Live;
using AOC.Domain.Contracts;
using AOC.Domain.Gameplay.Turns;
using AOC.Infrastructure.Data;
using Xunit;

namespace AOC.Tests.Modules;

public class VeDichViewTests
{
    private const string Now = "2026-01-01T12:00:00.000Z";

    private static List<VeDichQuestion> Board()
    {
        var cells = new List<VeDichQuestion>();
        foreach (var value in new[] { 20, 30, 40, 50 })
        {
            var count = value < 40 ? 6 : 4;
            for (var n = 1; n <= count; n++)
                cells.Add(new VeDichQuestion { Id = $"{value}-{n}", Value = value });
        }
        return cells;
    }

    private static VeDichPlayerState Player(string id) => new()
    {
        Id = id,
        Score = 0,
        Powers = PowerSet.Fresh()
    };

    private static List<MatchQuestion> Questions()
    {
        var questions = new List<MatchQuestion>();
        foreach (var cell in Board())
        {
            questions.Add(new MatchQuestion
            {
                Id = cell.Id,
                RoundId = "ve-dich",
                TurnId = "t1",
                Position = 0,
                Mode = QuestionMode.text,
                Kind = QuestionKind.TEXT,
                QuestionText = $"Câu {cell.Value}",
                Points = cell.Value,
                Payload = new QuestionPayload.Text(["đáp án"]),
                SourceId = cell.Id
            });
        }
        return questions;
    }

    private static Dictionary<string, object?> View(VeDichState state) =>
        LiveView.BuildPlayerView(new LiveView.ViewInput(
            "m1", "ve-dich", 1, Now, "u1", state, [], Questions: Questions()));

    private static Dictionary<string, string> WhereOf(Dictionary<string, object?> view)
    {
        var board = Assert.IsType<List<object?>>(view["board"]);
        var map = new Dictionary<string, string>();
        foreach (var entry in board)
        {
            var row = Assert.IsType<Dictionary<string, object?>>(entry);
            map[row["questionId"]!.ToString()!] = row["where"]!.ToString()!;
        }
        return map;
    }

    [Fact]
    public void AQuestionPlayedInPhase1_ReadsTakenInPhase2()
    {
        var state = VeDichTurn.CreateVeDich(Board(), [Player("a"), Player("b")]);
        var played = VeDichTurn.PickPhase1(state, "a", "20-1");
        var resolved = VeDichTurn.ResolveQuestion(played, new Verdicts(true, null));
        var ended = VeDichTurn.BeginPhase2(
            VeDichTurn.AdvanceTurn(VeDichTurn.AdvanceTurn(resolved)));

        var where = WhereOf(View(ended));

        Assert.Equal("taken", where["20-1"]);
        Assert.Equal("free", where["20-2"]);
        Assert.Equal("free", where["40-1"]);
    }

    [Fact]
    public void Phase1_DefersTheBigBandsInsteadOfCallingThemTaken()
    {
        var state = VeDichTurn.CreateVeDich(Board(), [Player("a")]);

        var where = WhereOf(View(state));

        Assert.Equal("free", where["20-1"]);
        Assert.Equal("deferred", where["40-1"]);
        Assert.Equal("deferred", where["50-1"]);
    }
}
