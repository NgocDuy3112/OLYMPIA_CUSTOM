using AOC.Api.Modules.Live;
using AOC.Domain.Gameplay.Turns;
using Xunit;

namespace AOC.Tests.Modules;

public class ButPhaViewTests
{
    private static readonly string Now = "2026-01-01T12:00:41.000Z";

    private static ButPhaState State(string revealedAt, string? openedAt) => new()
    {
        QuestionIds = ["bp-1", "bp-2", "bp-3", "bp-4"],
        QuestionRevealedAt = revealedAt,
        Window = openedAt is null
            ? AnswerWindow.TypedEveryone(30)
            : AnswerWindow.TypedEveryone(30).OpenFor(openedAt, 30),
    };

    private static Dictionary<string, object?> View(ButPhaState state) =>
        LiveView.BuildPlayerView(new LiveView.ViewInput(
            "m1", "but-pha", 1, Now, "u1", state, []));

    [Fact]
    public void OpenQuestion_StaysVisibleAfterTheClockRunsOut()
    {
        var view = View(State("2026-01-01T12:00:10.000Z", "2026-01-01T12:00:10.000Z"));

        var open = Assert.IsType<List<object?>>(view["open"]);
        var entry = Assert.IsType<Dictionary<string, object?>>(Assert.Single(open));
        Assert.Equal("bp-1", entry["questionId"]);
    }

    [Fact]
    public void OpenQuestion_CarriesADeadlineInThePast_SoTheTimerHitsZero()
    {
        var view = View(State("2026-01-01T12:00:10.000Z", "2026-01-01T12:00:10.000Z"));

        var open = Assert.IsType<List<object?>>(view["open"]);
        var entry = Assert.IsType<Dictionary<string, object?>>(Assert.Single(open));
        Assert.Equal("2026-01-01T12:00:40.000Z", entry["deadlineAt"]);
    }

    [Fact]
    public void RevealedButNotStarted_NoDeadlineYet_QuestionStillVisible()
    {
        var view = View(State("2026-01-01T12:00:41.000Z", null));

        var open = Assert.IsType<List<object?>>(view["open"]);
        var entry = Assert.IsType<Dictionary<string, object?>>(Assert.Single(open));
        Assert.Equal("bp-1", entry["questionId"]);
        Assert.Null(entry["deadlineAt"]);
    }

    [Fact]
    public void NoRevealedQuestion_NoOpenEntry()
    {
        var view = View(new ButPhaState { QuestionIds = ["bp-1", "bp-2", "bp-3", "bp-4"] });

        var open = Assert.IsType<List<object?>>(view["open"]);
        Assert.Empty(open);
    }
}
