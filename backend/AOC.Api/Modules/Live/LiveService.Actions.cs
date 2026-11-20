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
    public sealed record ActionContext(
        MatchEntity Match,
        List<string> OrderedRounds,
        Guid ActorId,
        string Now);

    public async Task<LiveRecord<JsonElement>> ApplyLiveActionAsync(
        Guid tournamentId, Guid matchId, int expectedVersion, LiveAction action, Guid actorId)
    {
        var match = await matches.GetMatchAsync(tournamentId.ToString(), matchId.ToString());
        if (match.Status != MatchStatus.LIVE) throw ApiException.Conflict("match is not LIVE");

        if (action is LiveAction.ScoreAdjust adjust)
        {
            if (adjust.Delta == 0) throw ApiException.BadRequest("delta must not be 0");
            var seated = match.PlayersList.Any(s =>
                s.Kind == "user" && s.UserId == adjust.UserId);
            if (!seated) throw ApiException.Forbidden("player is not seated in this match");
        }

        var tournament = await db.Tournaments.AsNoTracking()
            .FirstAsync(t => t.Id == tournamentId && t.DeletedAt == null);
        var ordered = MatchRounds.OrderedMatchRounds(tournament.RoundsList, match.RoundConfigsMap);
        var now = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ");

        var store = new PgLiveStore(db, matchId);
        var next = await Apply.ApplyLiveAction(store, expectedVersion, async (current, tx) =>
        {
            if (action is LiveAction.ScoreAdjust scoreAdjust)
            {
                return new Transition<JsonElement>(current.State,
                    [new AdjustFact(scoreAdjust.UserId, scoreAdjust.Delta, scoreAdjust.Reason,
                        actorId.ToString())]);
            }

            if (action is LiveAction.Regrade regrade)
            {
                var answer = await db.Answers.AsNoTracking().FirstOrDefaultAsync(a =>
                    a.MatchId == matchId
                    && a.QuestionId == Guid.Parse(regrade.QuestionId)
                    && a.UserId == Guid.Parse(regrade.PlayerId));
                if (answer is null)
                    throw new RuleError("NO_ANSWER",
                        $"no submitted answer from {regrade.PlayerId} to regrade");
                var newPoints = Math.Max(0, (answer.PointsAwarded ?? 0) + regrade.Delta);
                var regradeFacts = new List<LiveFact>
                {
                    new RegradeFact(regrade.QuestionId, regrade.PlayerId, newPoints)
                };

                if (current.RoundId == "khoi-dong")
                {
                    var kd = LiveState.ParseKhoiDong(current.State);
                    if (kd.Flow == Flow.rieng)
                    {
                        var runs = new Dictionary<string, Phase1State>(kd.Runs);
                        foreach (var pair in kd.Runs)
                        {
                            if (!pair.Value.Results.ContainsKey(regrade.QuestionId)) continue;
                            var results = new Dictionary<string, Phase1Result>(pair.Value.Results);
                            results[regrade.QuestionId] =
                                results[regrade.QuestionId] with { Points = newPoints };
                            runs[pair.Key] = pair.Value with { Results = results };
                        }
                        var nextKd = kd with { Runs = runs };
                        return new Transition<JsonElement>(
                            JsonSerializer.SerializeToElement(nextKd, JsonDefaults.Options), regradeFacts);
                    }
                    if (kd.Phase2 is not null
                        && kd.Phase2.Results.TryGetValue(regrade.QuestionId, out var byPlayer)
                        && byPlayer.ContainsKey(regrade.PlayerId))
                    {
                        var p2Results = new Dictionary<string, Dictionary<string, int>>(kd.Phase2.Results)
                        {
                            [regrade.QuestionId] = new Dictionary<string, int>(byPlayer)
                            {
                                [regrade.PlayerId] = newPoints
                            }
                        };
                        var nextKd = kd with { Phase2 = kd.Phase2 with { Results = p2Results } };
                        return new Transition<JsonElement>(
                            JsonSerializer.SerializeToElement(nextKd, JsonDefaults.Options), regradeFacts);
                    }
                }

                return new Transition<JsonElement>(current.State, regradeFacts);
            }

            var waiting = LiveFacts.IsWaitingState(current.State);

            if (waiting && action is LiveAction.KhoiDongEndRound
                or LiveAction.GiaiMaEndRound or LiveAction.ButPhaEndRound
                or LiveAction.VeDichEndRound)
            {
                return new Transition<JsonElement>(current.State, []);
            }

            if (action is LiveAction.RoundWaiting)
            {
                if (waiting) return new Transition<JsonElement>(current.State, []);
                if (current.State.ValueKind != JsonValueKind.Object || !current.State.EnumerateObject().Any())
                    return new Transition<JsonElement>(current.State, []);
                var pausedArchive = new Dictionary<string, JsonElement>(current.Archive)
                {
                    [current.RoundId] = current.State
                };
                return new Transition<JsonElement>(LiveFacts.WaitingMarker(), [], current.RoundId, pausedArchive);
            }

            if (action is LiveAction.RoundGoTo goTo)
            {
                if (!ordered.Contains(goTo.RoundId))
                    throw new RuleError("UNKNOWN_ROUND", $"round {goTo.RoundId} is not part of this match");
                if (goTo.RoundId == current.RoundId)
                {
                    if (waiting && current.Archive.TryGetValue(goTo.RoundId, out var resumed))
                        return new Transition<JsonElement>(resumed, []);
                    return new Transition<JsonElement>(current.State, []);
                }
                var archive = new Dictionary<string, JsonElement>(current.Archive);
                if (!waiting) archive[current.RoundId] = current.State;
                var target = current.Archive.TryGetValue(goTo.RoundId, out var restored)
                    ? restored
                    : JsonDefaults.EmptyObject;
                return new Transition<JsonElement>(target, [], goTo.RoundId, archive);
            }

            if (action is LiveAction.RevealAnswer reveal)
            {
                if (current.State.ValueKind != JsonValueKind.Object || !current.State.EnumerateObject().Any())
                    throw new RuleError("NOT_STARTED", "start the round before revealing an answer");
                var question = match.QuestionsList.FirstOrDefault(q =>
                    q.Id == reveal.QuestionId && q.RoundId == current.RoundId);
                if (question is null)
                    throw new RuleError("INVALID_QUESTION",
                        $"question {reveal.QuestionId} is not a question of round {current.RoundId}");

                var dict = current.State.Deserialize<Dictionary<string, JsonElement>>(JsonApi.Options)!;
                dict["revealedAnswer"] = JsonSerializer.SerializeToElement(question.Id);
                return new Transition<JsonElement>(
                    JsonSerializer.SerializeToElement(dict, JsonApi.Options), []);
            }

            if (!action.Kind.StartsWith($"{current.RoundId}."))
                throw new RuleError("WRONG_ROUND",
                    $"action {action.Kind} does not belong to round {current.RoundId}");

            if (action is LiveAction.GiaiMaEndRound or LiveAction.ButPhaEndRound or LiveAction.KhoiDongEndRound)
            {
                foreach (var question in match.QuestionsList.Where(q => q.RoundId == current.RoundId))
                {
                    var drafts = await tx.ReadAnswerDrafts(Guid.Parse(question.Id));
                    if (drafts.Any(d => !d.Judged))
                        throw new RuleError("UNJUDGED_ANSWERS",
                            "judge every submitted answer before ending the round");
                }
            }

            switch (current.RoundId)
            {
                case "giai-ma":
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

                case "but-pha":
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

                case "khoi-dong":
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

                case "ve-dich":
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

                default:
                    throw new RuleError("WRONG_ROUND",
                        $"round {current.RoundId} has no controller actions yet");
            }
        });

        await BroadcastSfxAsync(matchId, action, next);
        return next;
    }

    public static ButPhaState ButPhaEngineSeed(
        LiveAction action, RoundRules.ButPhaRules rules, JsonElement savedState)
    {
        if (action is LiveAction.ButPhaStart)
        {
            return new ButPhaState { Rules = rules };
        }
        return LiveState.ParseButPha(savedState);
    }

    private async Task BroadcastSfxAsync(Guid matchId, LiveAction action, LiveRecord<JsonElement> next)
    {
        try
        {
            var file = Sfx.FileFor(action, next.State, next.RoundId);
            if (file is null) return;
            await Sfx.BroadcastAsync(hub, matchId.ToString(), file);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "sfx cue for match {MatchId} failed", matchId);
        }
    }
}
