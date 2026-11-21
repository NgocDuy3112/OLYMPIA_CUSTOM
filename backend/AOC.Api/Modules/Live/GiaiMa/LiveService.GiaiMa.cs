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
    private async Task<Transition<JsonElement>> GiaiMaTransitionAsync(
        LiveAction action, ILiveRecordView<JsonElement> current, ILiveTx<JsonElement> tx,
        MatchEntity match, Guid actorId, string now)
    {
        var answerDrafts = new List<AnswerDraft>();
        if (action is LiveAction.GiaiMaResolveHint && LiveState.ParseGiaiMa(current.State).OpenHint is { } openHint)
        {
            answerDrafts = await tx.ReadAnswerDrafts(Guid.Parse(openHint));
        }
        else if (action is LiveAction.GiaiMaResolveHint)
        {
            throw new RuleError("NO_OPEN_HINT", "no hint window is open");
        }

        var hintTurnId = "";
        if (action is LiveAction.GiaiMaOpenHint open)
        {
            var hint = match.QuestionsList.FirstOrDefault(q => q.Id == open.HintId);
            if (hint is null) throw ApiException.BadRequest("hint is not a question of this match");
            if (hint.RoundId != current.RoundId)
                throw ApiException.BadRequest("hint is not part of the current round");
            hintTurnId = hint.TurnId;
        }
        if (action is LiveAction.GiaiMaSubmitKeyword || action is LiveAction.GiaiMaJudgeKeyword)
        {
            string qid;
            if (action is LiveAction.GiaiMaSubmitKeyword submitKeyword)
            {
                qid = submitKeyword.QuestionId;
            }
            else
            {
                qid = ((LiveAction.GiaiMaJudgeKeyword)action).QuestionId;
            }
            var q = match.QuestionsList.FirstOrDefault(c => c.Id == qid);
            if (q is null) throw ApiException.BadRequest("question is not part of this match");
            if (q.Kind != QuestionKind.KEYWORD)
                throw ApiException.BadRequest("the keyword question must be of kind KEYWORD");
        }

        GiaiMaState engine;
        if (action is LiveAction.GiaiMaStart)
        {
            engine = GiaiMaTurn.StartGiaiMa([], [], RoundRules.ResolveGiaiMa(
                match.RoundConfigsMap.GetValueOrDefault(current.RoundId)));
        }
        else
        {
            engine = LiveState.ParseGiaiMa(current.State);
        }

        var ctx = new GiaiMaContext(actorId.ToString(), current.RoundId, now,
            RoundRules.ResolveGiaiMa(match.RoundConfigsMap.GetValueOrDefault(current.RoundId)),
            hintTurnId, answerDrafts);
        var (next, facts) = GiaiMaApplier.Apply(engine, action, ctx);
        return new Transition<JsonElement>(
            JsonSerializer.SerializeToElement(next, JsonDefaults.Options), facts);
    }
}
