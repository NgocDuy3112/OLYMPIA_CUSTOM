using System.Text.Json;
using AOC.Api.Http;
using AOC.Api.Modules.Live;
using AOC.Domain.Gameplay;
using AOC.Domain.Contracts;
using AOC.Domain.Gameplay.Turns;
using Xunit;

namespace AOC.Tests.Modules;

public class ButPhaStartTests
{
    private static readonly RoundRules.ButPhaRules Rules = RuleBatches.ButPha;

    private static readonly List<string> MatchQuestionIds =
        ["bp-1", "bp-2", "bp-3", "bp-4"];

    private static readonly string Now = "2026-01-01T12:00:00.000Z";

    private static ButPhaApplier.ButPhaContext Ctx(List<string> questionIds) =>
        new("operator-1", "but-pha", Now, Rules, questionIds, []);

    private static JsonElement SavedState() =>
        JsonSerializer.SerializeToElement(new ButPhaState { Rules = Rules }, JsonApi.Options);

    [Fact]
    public void Start_SeedDoesNotValidateQuestionCount_ByItself()
    {
        var engine = LiveService.ButPhaEngineSeed(new LiveAction.ButPhaStart(), Rules, SavedState());

        var (next, _) = ButPhaApplier.Apply(engine, new LiveAction.ButPhaStart(), Ctx(MatchQuestionIds));

        Assert.Equal(MatchQuestionIds, next.QuestionIds);
        Assert.Equal(0, next.Cursor);
        Assert.False(next.Ended);
    }

    [Fact]
    public void Start_WithFewerMatchQuestions_StillRefusesWithRealCount()
    {
        var engine = LiveService.ButPhaEngineSeed(new LiveAction.ButPhaStart(), Rules, SavedState());

        var error = Assert.Throws<RuleError>(() =>
            ButPhaApplier.Apply(engine, new LiveAction.ButPhaStart(), Ctx(["bp-1"])));

        Assert.Equal("VALIDATION", error.Code);
        Assert.Contains("got 1", error.Message);
    }

    [Fact]
    public void NonStart_ParsesTheSavedState()
    {
        var saved = JsonSerializer.SerializeToElement(
            new ButPhaState { Rules = Rules, QuestionIds = MatchQuestionIds, Cursor = 2 },
            JsonApi.Options);

        var engine = LiveService.ButPhaEngineSeed(new LiveAction.ButPhaOpenQuestion(), Rules, saved);

        Assert.Equal(MatchQuestionIds, engine.QuestionIds);
        Assert.Equal(2, engine.Cursor);
    }
}
