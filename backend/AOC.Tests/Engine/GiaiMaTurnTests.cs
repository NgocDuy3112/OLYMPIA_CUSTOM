using AOC.Domain.Engine;
using AOC.Domain.Engine.Turns;
using Xunit;

namespace AOC.Tests.Engine;

public class GiaiMaTurnTests
{
    private static readonly string[] H = ["h1", "h2", "h3", "h4", "h5", "h6", "h7", "h8"];
    private const string Now = "2026-01-01T00:00:00.000Z";

    private static string At(int sec) =>
        DateTimeOffset.Parse(Now).AddSeconds(sec).UtcDateTime
            .ToString("yyyy-MM-ddTHH:mm:ss.fffZ");

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

    private static GiaiMaState PlayHints(string[] ids, string[] hintOrder,
        Func<string, string, bool> answers)
    {
        var s = GiaiMaTurn.StartGiaiMa(ids, H);
        foreach (var hint in hintOrder)
        {
            if (s.Stage != "hints") break;
            s = GiaiMaTurn.OpenHint(s, hint, Now);
            var byPlayer = s.Players
                .Where(p => !p.KeywordLocked)
                .ToDictionary(p => p.Id, p => answers(hint, p.Id));
            s = GiaiMaTurn.ResolveOpenHint(s, byPlayer);
        }
        return s;
    }

    [Fact]
    public void Setup_AcceptsAnyPlayerCount()
    {
        Assert.Equal("NO_ERROR", CodeOf(() => GiaiMaTurn.StartGiaiMa(["a"], H)));
        Assert.Equal("NO_ERROR", CodeOf(() => GiaiMaTurn.StartGiaiMa(["a", "b", "c", "d", "e"], H)));
    }

    [Fact]
    public void Setup_StartsAtKeyword100WithNoOpenHint()
    {
        var s = GiaiMaTurn.StartGiaiMa(["a", "b"], H);
        Assert.Equal(100, GiaiMaTurn.KeywordValueFor(s, "a"));
        Assert.Empty(s.Picked);
        Assert.Null(s.OpenHint);
    }

    [Fact]
    public void Windows_MayOpenHintsInAnyOrder()
    {
        var s = GiaiMaTurn.OpenHint(GiaiMaTurn.StartGiaiMa(["a"], H), "h5", Now);
        Assert.Equal("h5", s.OpenHint);
        s = GiaiMaTurn.ResolveOpenHint(s, new Dictionary<string, bool> { ["a"] = true });
        s = GiaiMaTurn.OpenHint(s, "h1", Now);
        Assert.Equal("h1", s.OpenHint);
        Assert.Equal(["h5"], s.Picked);
    }

    [Fact]
    public void Windows_OnlyOneAtATime()
    {
        var s = GiaiMaTurn.OpenHint(GiaiMaTurn.StartGiaiMa(["a"], H), "h1", Now);
        Assert.Equal("WINDOW_OPEN", CodeOf(() => GiaiMaTurn.OpenHint(s, "h2", Now)));
    }

    [Fact]
    public void Windows_PickedHintCannotReopen()
    {
        var s = GiaiMaTurn.ResolveOpenHint(
            GiaiMaTurn.OpenHint(GiaiMaTurn.StartGiaiMa(["a"], H), "h1", Now),
            new Dictionary<string, bool> { ["a"] = true });
        Assert.Equal("HINT_CONSUMED", CodeOf(() => GiaiMaTurn.OpenHint(s, "h1", Now)));
    }

    [Fact]
    public void Windows_ResolveWithoutOpenWindowRejected()
    {
        Assert.Equal("NO_OPEN_HINT", CodeOf(() => GiaiMaTurn.ResolveOpenHint(
            GiaiMaTurn.StartGiaiMa(["a"], H), new Dictionary<string, bool> { ["a"] = true })));
    }

    [Fact]
    public void Windows_CloseWithoutResolvingKeepsHintAvailable()
    {
        var s = GiaiMaTurn.OpenHint(GiaiMaTurn.StartGiaiMa(["a"], H), "h3", Now);
        s = GiaiMaTurn.CloseHintWindow(s);
        Assert.Null(s.OpenHint);
        Assert.Contains("h3", GiaiMaTurn.RemainingHints(s));
        Assert.Empty(s.Picked);
    }

    [Fact]
    public void Windows_CloseWithoutWindowRejected()
    {
        Assert.Equal("NO_OPEN_HINT", CodeOf(() =>
            GiaiMaTurn.CloseHintWindow(GiaiMaTurn.StartGiaiMa(["a"], H))));
    }

    [Fact]
    public void Resolution_RevealsHintToCorrectPlayersOnly()
    {
        var s = GiaiMaTurn.OpenHint(GiaiMaTurn.StartGiaiMa(["a", "b"], H), "h1", Now);
        s = GiaiMaTurn.ResolveOpenHint(s, new Dictionary<string, bool> { ["a"] = true, ["b"] = false });
        Assert.Equal(90, GiaiMaTurn.KeywordValueFor(s, "a"));
        Assert.Equal(100, GiaiMaTurn.KeywordValueFor(s, "b"));
        Assert.Equal(["h1"], s.Players.First(p => p.Id == "a").Revealed);
        Assert.Empty(s.Players.First(p => p.Id == "b").Revealed);
    }

    [Fact]
    public void Resolution_MissingAnswerCountsAsWrong()
    {
        var s = GiaiMaTurn.OpenHint(GiaiMaTurn.StartGiaiMa(["a", "b"], H), "h1", Now);
        s = GiaiMaTurn.ResolveOpenHint(s, new Dictionary<string, bool> { ["a"] = true });
        Assert.Equal(100, GiaiMaTurn.KeywordValueFor(s, "b"));
        Assert.Empty(s.Players.First(p => p.Id == "b").Revealed);
    }

    [Fact]
    public void Resolution_LockedPlayerNotRevealed()
    {
        var s = GiaiMaTurn.LockKeyword(GiaiMaTurn.StartGiaiMa(["a", "b"], H), "a");
        s = GiaiMaTurn.OpenHint(s, "h1", Now);
        s = GiaiMaTurn.ResolveOpenHint(s, new Dictionary<string, bool> { ["a"] = true, ["b"] = true });
        Assert.Empty(s.Players.First(p => p.Id == "a").Revealed);
        Assert.Equal(["h1"], s.Players.First(p => p.Id == "b").Revealed);
    }

    [Fact]
    public void Resolution_RoundEndsOnceAllHintsResolved()
    {
        var s = PlayHints(["a", "b"], H, (_, _) => false);
        Assert.Equal("ended", s.Stage);
        Assert.Empty(GiaiMaTurn.RemainingHints(s));
    }

    [Fact]
    public void Keyword_SubmittingLocksButAwardsNothing()
    {
        var s = GiaiMaTurn.StartGiaiMa(["a", "b"], H);
        s = GiaiMaTurn.ResolveOpenHint(GiaiMaTurn.OpenHint(s, "h1", Now),
            new Dictionary<string, bool> { ["a"] = true, ["b"] = false });
        s = GiaiMaTurn.ResolveOpenHint(GiaiMaTurn.OpenHint(s, "h2", Now),
            new Dictionary<string, bool> { ["a"] = true, ["b"] = false });
        s = GiaiMaTurn.LockKeyword(s, "a");
        Assert.True(s.Players.First(p => p.Id == "a").KeywordLocked);
        Assert.Equal(0, GiaiMaTurn.GiaiMaPoints(s, "a"));
        Assert.False(s.Players.First(p => p.Id == "a").Eliminated);
    }

    [Fact]
    public void Keyword_JudgingCorrectEarnsValueFrozenAtSubmit()
    {
        var s = GiaiMaTurn.StartGiaiMa(["a", "b"], H);
        s = GiaiMaTurn.ResolveOpenHint(GiaiMaTurn.OpenHint(s, "h1", Now),
            new Dictionary<string, bool> { ["a"] = true, ["b"] = false });
        s = GiaiMaTurn.ResolveOpenHint(GiaiMaTurn.OpenHint(s, "h2", Now),
            new Dictionary<string, bool> { ["a"] = true, ["b"] = false });
        s = GiaiMaTurn.LockKeyword(s, "a");
        s = GiaiMaTurn.JudgeKeyword(s, "a", true);
        Assert.Equal(80, GiaiMaTurn.GiaiMaPoints(s, "a"));
        Assert.False(s.Players.First(p => p.Id == "a").Eliminated);
    }

    [Fact]
    public void Keyword_JudgingWrongEarnsZeroAndEliminates()
    {
        var s = GiaiMaTurn.LockKeyword(GiaiMaTurn.StartGiaiMa(["a", "b"], H), "a");
        s = GiaiMaTurn.JudgeKeyword(s, "a", false);
        Assert.Equal(0, GiaiMaTurn.GiaiMaPoints(s, "a"));
        Assert.True(s.Players.First(p => p.Id == "a").Eliminated);
    }

    [Fact]
    public void Keyword_JudgingUnsubmittedRefused()
    {
        var s = GiaiMaTurn.StartGiaiMa(["a", "b"], H);
        Assert.Equal("NOT_SUBMITTED", CodeOf(() => GiaiMaTurn.JudgeKeyword(s, "a", true)));
    }

    [Fact]
    public void Keyword_EachPlayerSubmitsOnce()
    {
        var s = GiaiMaTurn.LockKeyword(GiaiMaTurn.StartGiaiMa(["a", "b"], H), "a");
        Assert.Equal("ALREADY_SUBMITTED", CodeOf(() => GiaiMaTurn.LockKeyword(s, "a")));
    }

    [Fact]
    public void Keyword_SubmittingDoesNotEndTheRound()
    {
        var s = GiaiMaTurn.LockKeyword(GiaiMaTurn.StartGiaiMa(["a", "b"], H), "a");
        Assert.Equal("hints", s.Stage);
        s = GiaiMaTurn.LockKeyword(s, "b");
        Assert.Equal("hints", s.Stage);
        s = GiaiMaTurn.JudgeKeyword(s, "a", true);
        s = GiaiMaTurn.JudgeKeyword(s, "b", false);
        Assert.Equal("hints", s.Stage);
        Assert.Equal("ended", GiaiMaTurn.EndGiaiMa(s).Stage);
    }

    [Fact]
    public void Keyword_NoSubmissionsAfterRoundEnded()
    {
        var s = GiaiMaTurn.EndGiaiMa(GiaiMaTurn.StartGiaiMa(["a", "b"], H));
        Assert.Equal("WRONG_STAGE", CodeOf(() => GiaiMaTurn.LockKeyword(s, "a")));
    }

    [Fact]
    public void WorkedPayouts()
    {
        var s = PlayHints(["a", "b"], H, (hint, who) => who switch
        {
            "a" => hint is "h1" or "h4" or "h7",
            "b" => hint == "h2",
            _ => false
        });
        Assert.Equal(70, GiaiMaTurn.KeywordValueFor(s, "a"));
        Assert.Equal(90, GiaiMaTurn.KeywordValueFor(s, "b"));
    }

    [Fact]
    public void Window_OpenAtOpenAndJustInside15s()
    {
        var s = GiaiMaTurn.OpenHint(GiaiMaTurn.StartGiaiMa(["a"], H), "h1", Now);
        Assert.True(GiaiMaTurn.IsWindowOpen(s, Now));
        Assert.True(GiaiMaTurn.IsWindowOpen(s, At(RoundRules.Defaults.GiaiMa.HintWindowS)));
    }

    [Fact]
    public void Window_ClosedPast15s()
    {
        var s = GiaiMaTurn.OpenHint(GiaiMaTurn.StartGiaiMa(["a"], H), "h1", Now);
        var past = DateTimeOffset.Parse(Now)
            .AddSeconds(RoundRules.Defaults.GiaiMa.HintWindowS)
            .AddMilliseconds(1)
            .UtcDateTime.ToString("yyyy-MM-ddTHH:mm:ss.fffZ");
        Assert.False(GiaiMaTurn.IsWindowOpen(s, past));
    }

    [Fact]
    public void Window_ClosedWhenNoWindowOpen()
    {
        Assert.False(GiaiMaTurn.IsWindowOpen(GiaiMaTurn.StartGiaiMa(["a"], H), Now));
    }

    [Fact]
    public void Window_ResolveAndCloseBothEndIt()
    {
        var resolved = GiaiMaTurn.ResolveOpenHint(
            GiaiMaTurn.OpenHint(GiaiMaTurn.StartGiaiMa(["a"], H), "h1", Now),
            new Dictionary<string, bool> { ["a"] = true });
        Assert.False(GiaiMaTurn.IsWindowOpen(resolved, Now));

        var closed = GiaiMaTurn.CloseHintWindow(
            GiaiMaTurn.OpenHint(GiaiMaTurn.StartGiaiMa(["a"], H), "h1", Now));
        Assert.False(GiaiMaTurn.IsWindowOpen(closed, Now));
    }

    [Fact]
    public void WhoMayAnswer_ActivePlayerWhileWindowOpen()
    {
        var s = GiaiMaTurn.OpenHint(GiaiMaTurn.StartGiaiMa(["a", "b"], H), "h1", Now);
        Assert.True(GiaiMaTurn.CanPlayerAnswer(s, "a", Now));
    }

    [Fact]
    public void WhoMayAnswer_NobodyAfterWindowClosed()
    {
        var s = GiaiMaTurn.OpenHint(GiaiMaTurn.StartGiaiMa(["a"], H), "h1", Now);
        Assert.False(GiaiMaTurn.CanPlayerAnswer(s, "a", At(20)));
    }

    [Fact]
    public void WhoMayAnswer_SubmittedPlayerCannot()
    {
        var s = GiaiMaTurn.LockKeyword(GiaiMaTurn.StartGiaiMa(["a", "b"], H), "a");
        s = GiaiMaTurn.OpenHint(s, "h1", Now);
        Assert.False(GiaiMaTurn.CanPlayerAnswer(s, "a", Now));
        Assert.True(GiaiMaTurn.CanPlayerAnswer(s, "b", Now));
    }

    [Fact]
    public void WhoMayAnswer_EliminatedPlayerCannot()
    {
        var s = GiaiMaTurn.LockKeyword(GiaiMaTurn.StartGiaiMa(["a", "b"], H), "a");
        s = GiaiMaTurn.JudgeKeyword(s, "a", false);
        s = GiaiMaTurn.OpenHint(s, "h1", Now);
        Assert.False(GiaiMaTurn.CanPlayerAnswer(s, "a", Now));
    }

    [Fact]
    public void WhoMayAnswer_StrangerCannot()
    {
        var s = GiaiMaTurn.OpenHint(GiaiMaTurn.StartGiaiMa(["a"], H), "h1", Now);
        Assert.False(GiaiMaTurn.CanPlayerAnswer(s, "stranger", Now));
    }
}
