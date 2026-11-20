using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using AOC.Api.Http;
using AOC.Api.Modules.Live.TieBreak;
using AOC.Api.Modules.Matches;
using AOC.Api.Realtime;
using AOC.Api.Shared;
using AOC.Domain.Contracts;
using AOC.Domain.Gameplay;
using AOC.Domain.Gameplay.Turns;
using AOC.Infrastructure.Data;
using AOC.Infrastructure.Data.Entities;

namespace AOC.Api.Modules.Live;

public sealed partial class LiveService
{
    private async Task<Transition<JsonElement>> KhoiDongTransitionAsync(
        LiveAction action, ILiveRecordView<JsonElement> current, ILiveTx<JsonElement> tx,
        MatchEntity match, Guid actorId, string now)
    {
        var config = match.RoundConfigsMap.GetValueOrDefault(current.RoundId)
            ?? AocRulebook.AocRoundConfig(current.RoundId);
        var turns = config?.Turns ?? [];
        var questions = match.QuestionsList
            .Where(q => q.RoundId == current.RoundId)
            .OrderBy(q => q.Position)
            .ToList();
        List<string> IdsFor(string? turnId) => turnId is null
            ? []
            : questions.Where(q => q.TurnId == turnId).Select(q => q.Id).ToList();

        KhoiDongState engine;
        if (action is LiveAction.KhoiDongStart)
        {
            engine = new KhoiDongState { Rules = RoundRules.ResolveKhoiDong(config) };
        }
        else
        {
            engine = LiveState.ParseKhoiDong(current.State);
        }

        var answerDrafts = new List<AnswerDraft>();
        if (action is LiveAction.KhoiDongJudge or LiveAction.KhoiDongNextQuestion)
        {
            var questionId = engine.Phase2 is null
                ? null
                : KhoiDongTurn.Phase2QuestionId(engine.Phase2);
            if (questionId is not null)
                answerDrafts = await tx.ReadAnswerDrafts(Guid.Parse(questionId));
        }

        var ctx = new KhoiDongApplier.KhoiDongContext(
            actorId.ToString(), current.RoundId, now,
            RoundRules.ResolveKhoiDong(config),
            match.PlayersList.Where(s => s.Kind == "user")
                .OrderBy(s => s.Seed).Select(s => s.UserId).ToList(),
            IdsFor(turns.Count > 0 ? turns[0].Id : null),
            IdsFor(turns.Count > 1 ? turns[1].Id : null),
            answerDrafts);

        var (next, facts) = KhoiDongApplier.Apply(engine, action, ctx);
        return new Transition<JsonElement>(
            JsonSerializer.SerializeToElement(next, JsonDefaults.Options), facts);
    }
}
