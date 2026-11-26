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

    public sealed record ActionApplied(LiveRecord<JsonElement> Record, List<VerdictChange> VerdictChanges);

    public async Task<ActionApplied> ApplyLiveActionAsync(
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

            var kindParts = action.Kind.Split('.', 2);
            if (kindParts.Length != 2 || !string.Equals(kindParts[0], current.RoundId, StringComparison.Ordinal))
                throw new RuleError("WRONG_ROUND",
                    $"action {action.Kind} does not belong to round {current.RoundId}");

            if (action is LiveAction.GiaiMaEndRound or LiveAction.ButPhaEndRound or LiveAction.KhoiDongEndRound)
            {
                foreach (var question in match.QuestionsList.Where(q => q.RoundId == current.RoundId))
                {
                    var drafts = await tx.ReadAnswerDrafts(Guid.Parse(question.Id));
                    if (drafts.Any(d => d.Verdict is null))
                        throw new RuleError("UNJUDGED_ANSWERS",
                            "judge every submitted answer before ending the round");
                }
            }

            switch (current.RoundId)
            {
                case "giai-ma":
                    return await GiaiMaTransitionAsync(action, current, tx, match, actorId, now);

                case "but-pha":
                    return await ButPhaTransitionAsync(action, current, tx, match, actorId, now);

                case "khoi-dong":
                    return await KhoiDongTransitionAsync(action, current, tx, match, actorId, now);

                case "ve-dich":
                    return await VeDichTransitionAsync(action, current, tx, match, matchId, actorId, now);

                default:
                    throw new RuleError("WRONG_ROUND",
                        $"round {current.RoundId} has no controller actions yet");
            }
        });

        await BroadcastSfxAsync(matchId, action, next);
        return new ActionApplied(next, store.VerdictChanges);
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
