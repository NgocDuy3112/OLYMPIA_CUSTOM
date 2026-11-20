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
    private async Task<Transition<JsonElement>> VeDichTransitionAsync(
        LiveAction action, ILiveRecordView<JsonElement> current, ILiveTx<JsonElement> tx,
        MatchEntity match, Guid matchId, Guid actorId, string now)
    {
        VeDichState engine;
        if (action is LiveAction.VeDichStart)
        {
            engine = new VeDichState
            {
                Rules = RoundRules.ResolveVeDich(
                    match.RoundConfigsMap.GetValueOrDefault(current.RoundId))
            };
        }
        else
        {
            engine = LiveState.ParseVeDich(current.State);
        }

        var drafts = new List<AnswerDraft>();
        var needsDrafts = action is LiveAction.VeDichResolve or LiveAction.VeDichJudge;
        if (engine.Open is not null)
        {
            if (needsDrafts)
                drafts = await tx.ReadAnswerDrafts(Guid.Parse(engine.Open.Question.Id));
        }

        Dictionary<string, int> sums;
        if (action is LiveAction.VeDichStart)
        {
            sums = await reader.SumPointsByPlayerAsync(matchId);
        }
        else
        {
            sums = new Dictionary<string, int>();
        }

        var questions = match.QuestionsList
            .Where(q => q.RoundId == "ve-dich")
            .OrderBy(q => q.Position)
            .Select(q => new VeDichQuestion
            {
                Id = q.Id,
                Value = q.Points
            })
            .ToList();

        var players = match.PlayersList
            .Where(s => s.Kind == "user")
            .Select(s => (Id: s.UserId, Score: sums.GetValueOrDefault(s.UserId)))
            .ToList();

        var ctx = new VeDichApplier.VeDichContext(
            actorId.ToString(), current.RoundId, now,
            RoundRules.ResolveVeDich(match.RoundConfigsMap.GetValueOrDefault(current.RoundId)),
            questions, players, drafts);

        var (next, facts) = VeDichApplier.Apply(engine, action, ctx);
        return new Transition<JsonElement>(
            JsonSerializer.SerializeToElement(next, JsonDefaults.Options), facts);
    }
}
