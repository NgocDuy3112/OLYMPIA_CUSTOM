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
    private async Task<Transition<JsonElement>> ButPhaTransitionAsync(
        LiveAction action, ILiveRecordView<JsonElement> current, ILiveTx<JsonElement> tx,
        MatchEntity match, Guid actorId, string now)
    {
        var butPhaRules = RoundRules.ResolveButPha(
            match.RoundConfigsMap.GetValueOrDefault(current.RoundId));
        var engine = ButPhaEngineSeed(action, butPhaRules, current.State);

        var answerDrafts = new List<AnswerDraft>();
        if (action is LiveAction.ButPhaFinalize finalize)
        {
            answerDrafts = await tx.ReadAnswerDrafts(Guid.Parse(finalize.QuestionId));
            global::AOC.Api.Modules.Live.Apply.AssertVerdictCoverage(
                answerDrafts, finalize.Verdicts, "finalizing");
        }
        if (action is LiveAction.ButPhaCloseQuestion)
        {
            var open = ButPhaTurn.OpenQuestionId(engine);
            if (open is not null)
            {
                var drafts = await tx.ReadAnswerDrafts(Guid.Parse(open));
                if (drafts.Any(d => !d.Judged))
                    throw new RuleError("UNJUDGED_ANSWERS",
                        "judge every submitted answer before closing the question");
            }
        }

        var ctx = new ButPhaApplier.ButPhaContext(actorId.ToString(), current.RoundId, now,
            butPhaRules,
            match.QuestionsList.Where(q => q.RoundId == current.RoundId)
                .OrderBy(q => q.Position).Select(q => q.Id).ToList(),
            answerDrafts);
        Transition<JsonElement> transition;
        try
        {
            var (next, facts) = ButPhaApplier.Apply(engine, action, ctx);
            transition = new Transition<JsonElement>(
                JsonSerializer.SerializeToElement(next, JsonDefaults.Options), facts);
        }
        catch (RuleError error) when (error.Code == "VALIDATION" && action is LiveAction.ButPhaStart)
        {
            var perRound = string.Join(", ", match.QuestionsList
                .GroupBy(q => q.RoundId)
                .Select(group => $"{group.Key}: {group.Count()}"));
            throw new RuleError(error.Code,
                $"{error.Message} — questions stored on this match by round: [{perRound}]");
        }
        return transition;
    }
}
