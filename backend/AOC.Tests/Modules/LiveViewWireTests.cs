using System.Text.Json;
using AOC.Api.Http;
using AOC.Api.Modules.Live;
using AOC.Domain.Contracts;
using AOC.Domain.Gameplay.Turns;
using Xunit;

namespace AOC.Tests.Modules;

public class LiveViewWireTests
{
    private const string T0 = "2026-01-01T12:00:00.000Z";

    private static readonly string[] WireKeys =
    [
        "stage", "phase2Begun", "phase2Closed", "questionIndex", "questionCount",
        "windowOpen", "oral", "openStage", "clockStarted", "buzzerId", "buzzerMs",
        "assignedToId", "answererId", "power", "stagedPower", "turnPowerUsed",
        "pendingQuestionId", "pendingValues", "turnPicked", "picksConfirmed",
        "powersLeft", "hintsRemaining", "hintsPicked", "openHintId", "hintsLocked",
        "questionId", "opened", "deadlineAt", "frozenRemainingMs", "canAnswer",
        "canBuzz", "answerState", "verdicts"
    ];

    private static Dictionary<string, object?> PlayerView(string roundId, object state) =>
        LiveView.BuildPlayerView(new LiveView.ViewInput(
            "m1", roundId, 1, T0, "u1", state, []));

    private static JsonElement Raw(object state) =>
        JsonSerializer.SerializeToElement(state, JsonApi.Options);

    private static void CollectPlayerKeys(Dictionary<string, object?> view, HashSet<string> keys)
    {
        keys.UnionWith(view.Keys);

        if (view.TryGetValue("me", out var meValue) && meValue is Dictionary<string, object?> me)
            keys.UnionWith(me.Keys);

        if (view.TryGetValue("open", out var openValue) && openValue is List<object?> entries)
            foreach (var entry in entries)
                if (entry is Dictionary<string, object?> fields) keys.UnionWith(fields.Keys);

        if (view.TryGetValue("oral", out var oralValue) && oralValue is Dictionary<string, object?> oral)
            keys.UnionWith(oral.Keys);
    }

    private static void CollectConsoleKeys(string roundId, object state, HashSet<string> keys)
    {
        var facts = LiveFacts.ConsoleFacts(roundId, Raw(state), T0);
        Assert.NotNull(facts);
        keys.UnionWith(facts.Keys);
    }

    private static GiaiMaState GiaiMa() => new()
    {
        Players = [new GiaiMaPlayer { Id = "u1" }],
        HintIds = ["h1", "h2"],
        Picked = ["h1"],
        OpenHint = "h1",
        HintWindow = AnswerWindow.TypedEveryone(15).OpenFor(T0, 15)
    };

    private static ButPhaState ButPha() => new()
    {
        QuestionIds = ["b1", "b2", "b3", "b4"],
        QuestionRevealedAt = T0,
        Window = AnswerWindow.TypedEveryone(30).OpenFor(T0, 30)
    };

    private static KhoiDongState KhoiDongRieng() => new()
    {
        Flow = Flow.rieng,
        Order = ["u1"],
        ActiveIndex = 0,
        Engaged = true,
        ClockStarted = true,
        ClockStartedAt = T0,
        Runs = new Dictionary<string, Phase1State>
        {
            ["u1"] = new()
            {
                QuestionIds = ["k1", "k2"],
                BudgetS = 40,
                PointsPerCorrect = 10,
                ElapsedS = 5
            }
        }
    };

    private static KhoiDongState KhoiDongChung() => new()
    {
        Flow = Flow.chung,
        Order = ["u1"],
        Phase2 = new Phase2State
        {
            QuestionIds = ["k1"],
            Index = 0,
            Window = AnswerWindow.TypedEveryone(10).OpenFor(T0, 10)
        }
    };

    private static VeDichState VeDich() => new()
    {
        Phase = 2,
        Players =
        [
            new VeDichPlayerState
            {
                Id = "u1",
                Powers = PowerSet.Fresh().Stage(PowerKind.STAR, null)
            },
            new VeDichPlayerState { Id = "u2" }
        ],
        TurnIndex = 0,
        Open = new OpenQuestion
        {
            Question = new VeDichQuestion { Id = "v1", Value = 20 },
            Answerer = "u1",
            Window = AnswerWindow.BuzzOthers(5, "u1").OpenFor(T0, 5) with
            {
                Buzzer = "u2",
                BuzzerMs = 500
            },
            Revealed = true
        }
    };

    [Fact]
    public void FourViews_KeepEveryWireKey()
    {
        var keys = new HashSet<string>();

        CollectPlayerKeys(PlayerView("giai-ma", GiaiMa()), keys);
        CollectConsoleKeys("giai-ma", GiaiMa(), keys);

        CollectPlayerKeys(PlayerView("but-pha", ButPha()), keys);
        CollectConsoleKeys("but-pha", ButPha(), keys);

        CollectPlayerKeys(PlayerView("khoi-dong", KhoiDongRieng()), keys);
        CollectPlayerKeys(PlayerView("khoi-dong", KhoiDongChung()), keys);
        CollectConsoleKeys("khoi-dong", KhoiDongChung(), keys);

        var veDichView = PlayerView("ve-dich", VeDich());
        CollectPlayerKeys(veDichView, keys);
        CollectConsoleKeys("ve-dich", VeDich(), keys);

        Assert.All(WireKeys, key => Assert.Contains(key, keys));

        var oral = Assert.IsType<Dictionary<string, object?>>(
            PlayerView("khoi-dong", KhoiDongRieng())["oral"]);
        Assert.True(oral.ContainsKey("deadlineAt"));

        var open = Assert.IsType<List<object?>>(veDichView["open"]);
        var entry = Assert.IsType<Dictionary<string, object?>>(Assert.Single(open));
        Assert.True(entry.ContainsKey("frozenRemainingMs"));
    }
}
