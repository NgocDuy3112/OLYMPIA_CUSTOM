using System.Text.Json;
using AOC.Api.Http;
using AOC.Domain.Contracts;
using AOC.Domain.Engine;
using AOC.Domain.Engine.Scoring;
using AOC.Domain.Engine.Turns;

namespace AOC.Api.Modules.Live;

/// <summary>Port of live/giai-ma.ts GiaiMaContext.</summary>
public sealed record GiaiMaContext(
    string ActorId, string RoundId, string Now, RoundRules.GiaiMaRules Rules,
    string HintTurnId, List<AnswerDraft> AnswerDrafts);

/// <summary>Port of live/giai-ma.ts applyGiaiMaAction.</summary>
public static class GiaiMaApplier
{
    public static (GiaiMaState State, List<LiveFact> Facts) Apply(
        GiaiMaState state, LiveAction action, GiaiMaContext ctx)
    {
        switch (action)
        {
            case LiveAction.GiaiMaStart start:
                return (GiaiMaTurn.StartGiaiMa(start.PlayerIds, start.HintIds, ctx.Rules), []);

            case LiveAction.GiaiMaOpenHint openHint:
            {
                var next = GiaiMaTurn.PickHint(state, openHint.HintId);
                var facts = new List<LiveFact>
                {
                    Facts.Pick(openHint.HintId, ctx.ActorId, ctx.RoundId, ctx.HintTurnId, next.Picked.Count + 1)
                };
                return (next, facts);
            }

            case LiveAction.GiaiMaStartWindow:
                return (GiaiMaTurn.StartWindow(state, ctx.Now), []);

            case LiveAction.GiaiMaCloseHintWindow:
                return (GiaiMaTurn.CloseHintWindow(state), []);

            case LiveAction.GiaiMaResolveHint resolve:
            {
                global::AOC.Api.Modules.Live.Apply.AssertVerdictCoverage(ctx.AnswerDrafts, resolve.Verdicts, "resolving the hint");
                var answers = resolve.Verdicts.ToDictionary(v => v.PlayerId, v => v.Correct);
                var next = GiaiMaTurn.ResolveOpenHint(state, answers);
                var openHint = state.OpenHint!;
                var facts = resolve.Verdicts.Select(v => (LiveFact)new JudgeFact(
                    openHint, v.PlayerId,
                    v.Correct ? Verdict.CORRECT : Verdict.INCORRECT,
                    0)).ToList();
                return (next, facts);
            }

            case LiveAction.GiaiMaSubmitKeyword submit:
            {
                var next = GiaiMaTurn.LockKeyword(state, submit.PlayerId);
                var facts = new List<LiveFact>
                {
                    Facts.Draft(submit.QuestionId, submit.PlayerId, submit.Text,
                        submit.Suggestion == VerdictSuggestion.CORRECT ? Verdict.CORRECT : Verdict.INCORRECT)
                };
                return (next, facts);
            }

            case LiveAction.GiaiMaJudgeKeyword judge:
            {
                var next = GiaiMaTurn.JudgeKeyword(state, judge.PlayerId, judge.Correct);
                var facts = new List<LiveFact>
                {
                    new JudgeFact(judge.QuestionId, judge.PlayerId,
                        judge.Correct ? Verdict.CORRECT : Verdict.INCORRECT,
                        GiaiMaTurn.GiaiMaPoints(next, judge.PlayerId))
                };
                return (next, facts);
            }

            case LiveAction.GiaiMaEndRound:
                return (GiaiMaTurn.EndGiaiMa(state), []);

            default:
                throw new RuleError("VALIDATION", $"unhandled giai-ma action {action.Kind}");
        }
    }
}

/// <summary>Port of live/but-pha.ts applyButPhaAction.</summary>
public static class ButPhaApplier
{
    public sealed record ButPhaContext(
        string ActorId, string RoundId, string Now, RoundRules.ButPhaRules Rules,
        List<string> QuestionIds, List<AnswerDraft> AnswerDrafts);

    public static (ButPhaState State, List<LiveFact> Facts) Apply(
        ButPhaState state, LiveAction action, ButPhaContext ctx)
    {
        switch (action)
        {
            case LiveAction.ButPhaStart:
                return (ButPhaTurn.StartButPha(ctx.QuestionIds, ctx.Rules), []);

            case LiveAction.ButPhaOpenQuestion:
                return (ButPhaTurn.OpenCurrentQuestion(state, ctx.Now), []);

            case LiveAction.ButPhaCloseQuestion:
                return (ButPhaTurn.CloseQuestion(state), []);

            case LiveAction.ButPhaStartClock:
                return (ButPhaTurn.StartClock(state, ctx.Now), []);

            case LiveAction.ButPhaEndRound:
                return (ButPhaTurn.EndButPha(state), []);

            case LiveAction.ButPhaFinalize finalize:
            {
                var questionId = ButPhaTurn.OpenQuestionId(state)
                    ?? throw new RuleError("ENDED", "but-pha is over");
                if (questionId != finalize.QuestionId)
                    throw new RuleError("INVALID_QUESTION",
                        $"question {finalize.QuestionId} is not the open question");

                var times = ctx.AnswerDrafts
                    .GroupBy(d => d.UserId)
                    .ToDictionary(g => g.Key, g => g.First().AnsweredMs);

                var results = new List<FinalResult>();
                foreach (var (playerId, correct) in finalize.Verdicts)
                {
                    if (!times.TryGetValue(playerId, out var answeredMs) || answeredMs is null)
                        throw new RuleError("NO_ANSWER", $"no submitted answer from {playerId}");
                    results.Add(new FinalResult(playerId, correct, answeredMs.Value / 1000.0));
                }

                var next = ButPhaTurn.FinalizeQuestion(state, results);

                var recorded = next.Answers[questionId].ToDictionary(a => a.PlayerId, a => a.Correct);
                var facts = results.Select(r => (LiveFact)new JudgeFact(
                    questionId, r.PlayerId,
                    recorded.GetValueOrDefault(r.PlayerId) ? Verdict.CORRECT : Verdict.INCORRECT,
                    next.Points.GetValueOrDefault(questionId)?.GetValueOrDefault(r.PlayerId) ?? 0
                )).ToList();
                return (next, facts);
            }

            default:
                throw new RuleError("VALIDATION", $"unhandled but-pha action {action.Kind}");
        }
    }
}

/// <summary>Port of live/khoi-dong.ts applyKhoiDongAction.</summary>
public static class KhoiDongApplier
{
    public sealed record KhoiDongContext(
        string ActorId, string RoundId, string Now, RoundRules.KhoiDongRules Rules,
        List<string> PlayerIds, List<string> Phase1QuestionIds, List<string> Phase2QuestionIds,
        List<AnswerDraft> AnswerDrafts);

    public static (KhoiDongState State, List<LiveFact> Facts) Apply(
        KhoiDongState state, LiveAction action, KhoiDongContext ctx)
    {
        switch (action)
        {
            case LiveAction.KhoiDongStart start:
            {
                var started = KhoiDongRound.StartKhoiDong(ctx.PlayerIds, ctx.Phase1QuestionIds, ctx.Rules);
                if (start.Phase == 2)
                    return (KhoiDongRound.BeginPhase2(started, ctx.Phase2QuestionIds), []);
                return (started, []);
            }

            case LiveAction.KhoiDongRecordOral recordOral:
            {
                var playerId = recordOral.PlayerId ?? KhoiDongRound.ActivePlayerId(state)
                    ?? throw new RuleError("NO_ACTIVE_PLAYER", "no player is answering");

                var next = KhoiDongRound.RecordOral(state, recordOral.Correct, recordOral.SpentS, recordOral.PlayerId);

                // the fact carries the question the graded player was on — read it
                // off the state the action started from, before the cursor moved
                var questionId = KhoiDongRound.QuestionIdOf(state, playerId)
                    ?? throw new RuleError("NO_ACTIVE_PLAYER", "no player is answering");

                if (!next.Runs[playerId].Results.TryGetValue(questionId, out var recorded))
                    return (next, []);

                var facts = new List<LiveFact>
                {
                    Facts.Oral(questionId, playerId,
                        recorded.Correct ? Verdict.CORRECT : Verdict.INCORRECT,
                        recorded.Points)
                };
                return (next, facts);
            }

            case LiveAction.KhoiDongSetTurn setTurn:
                return (KhoiDongRound.SetTurn(state, setTurn.PlayerId), []);

            case LiveAction.KhoiDongTimeOutRun:
                return (KhoiDongRound.TimeOutRun(state), []);

            case LiveAction.KhoiDongBeginPhase2:
                return (KhoiDongRound.BeginPhase2(state, ctx.Phase2QuestionIds), []);

            case LiveAction.KhoiDongStartWindow:
                return (KhoiDongRound.OpenWindow(state, ctx.Now), []);

            case LiveAction.KhoiDongJudge judge:
            {
                var questionId = state.Phase2 is null ? null : KhoiDongTurn.Phase2QuestionId(state.Phase2);
                if (questionId is null) throw new RuleError("PHASE_ENDED", "chung is over");

                if (!ctx.AnswerDrafts.Any(d => d.UserId == judge.PlayerId))
                    throw new RuleError("NO_ANSWER", $"no submitted answer from {judge.PlayerId} to judge");

                var next = KhoiDongRound.JudgeCard(state, judge.PlayerId, judge.Correct);
                var points = 0;
                if (next.Phase2 is not null
                    && next.Phase2.Results.TryGetValue(questionId, out var byPlayer))
                {
                    points = byPlayer.GetValueOrDefault(judge.PlayerId);
                }
                var facts = new List<LiveFact>
                {
                    new JudgeFact(questionId, judge.PlayerId,
                        judge.Correct ? Verdict.CORRECT : Verdict.INCORRECT, points)
                };
                return (next, facts);
            }

            case LiveAction.KhoiDongNextQuestion:
            {
                var questionId = state.Phase2 is null ? null : KhoiDongTurn.Phase2QuestionId(state.Phase2);
                if (questionId is not null && ctx.AnswerDrafts.Any(d => !d.Judged))
                    throw new RuleError("UNJUDGED_ANSWERS",
                        "judge every submitted answer before moving to the next question");
                return (KhoiDongRound.NextQuestion(state), []);
            }

            case LiveAction.KhoiDongEndRound:
                return (KhoiDongRound.EndKhoiDong(state), []);

            default:
                throw new RuleError("VALIDATION", $"unhandled khoi-dong action {action.Kind}");
        }
    }
}

/// <summary>Port of live/ve-dich.ts applyVeDichAction.</summary>
public static class VeDichApplier
{
    public sealed record VeDichContext(
        string ActorId, string RoundId, string Now, RoundRules.VeDichRules Rules,
        List<VeDichQuestion> Questions, List<(string Id, int Score)> Players,
        List<AnswerDraft> Drafts);

    public static (VeDichState State, List<LiveFact> Facts) Apply(
        VeDichState state, LiveAction action, VeDichContext ctx)
    {
        switch (action)
        {
            case LiveAction.VeDichStart start:
            {
                var players = ctx.Players.Select(p => new VeDichPlayerState
                {
                    Id = p.Id,
                    Score = p.Score, // cumulative, so phase 1 ordering is real
                    PowersLeft = [Power.STAR, Power.ASSIGN]
                }).ToList();
                var created = VeDichTurn.CreateVeDich(ctx.Questions, players, ctx.Rules);
                if (start.Phase == 2)
                    return (VeDichTurn.BeginPhase2(created), []);
                return (created, []);
            }

            case LiveAction.VeDichPick pick:
            {
                var before = state;
                var next = VeDichTurn.PickPhase1(state, pick.PlayerId, pick.QuestionId, ctx.Now);
                return (next,
                    [Facts.Pick(pick.QuestionId, pick.PlayerId, ctx.RoundId, "phase-1", before.TurnIndex + 1)]);
            }

            case LiveAction.VeDichPickBatch pickBatch:
            {
                var before = state;
                var next = VeDichTurn.PickPhase2(state, pickBatch.PlayerId, pickBatch.QuestionIds);
                var facts = pickBatch.QuestionIds
                    .Select(q => (LiveFact)Facts.Pick(q, pickBatch.PlayerId, ctx.RoundId, "phase-2", before.TurnIndex + 1))
                    .ToList();
                return (next, facts);
            }

            case LiveAction.VeDichDeclarePower declare:
                return (VeDichTurn.DeclarePower(state, declare.PlayerId, declare.PowerValue, declare.TargetId), []);

            case LiveAction.VeDichOpenQuestion openQuestion:
            {
                var staged = state.StagedPower;
                var next = VeDichTurn.OpenPhase2Question(state, openQuestion.QuestionId, ctx.Now);
                if (staged is null) return (next, []);
                var facts = new List<LiveFact>
                {
                    Facts.Power(openQuestion.QuestionId, next.Open!.Answerer, ctx.RoundId,
                        staged.Power, staged.TargetId)
                };
                return (next, facts);
            }

            case LiveAction.VeDichLockBuzz:
                return (VeDichTurn.LockBuzzWindow(state), []);

            case LiveAction.VeDichPickRound pickRound:
                return (VeDichTurn.PickRound(state, pickRound.QuestionIds), []);

            case LiveAction.VeDichNextQuestion:
                return (VeDichTurn.NextQuestion(state), []);

            case LiveAction.VeDichClearPicks:
                return (VeDichTurn.ClearPicks(state), []);

            case LiveAction.VeDichJudge judge:
            {
                // phase 1 is graded player by player — each verdict pays for
                // whoever actually typed an answer (JudgeFact needs that row)
                if (state.Phase != 1) throw new RuleError("WRONG_PHASE", "judge only applies in phase 1");
                var open = state.Open ?? throw new RuleError("NOTHING_OPEN", "no question is open");
                var points = VeDichScoring.Points(open.Question.Value, judge.Correct, ctx.Rules);
                return (state, [new JudgeFact(open.Question.Id, judge.PlayerId,
                    judge.Correct ? Verdict.CORRECT : Verdict.INCORRECT, points)]);
            }

            case LiveAction.VeDichReveal:
                return (VeDichTurn.RevealQuestion(state, ctx.Now), []);

            case LiveAction.VeDichStartClock:
                return (VeDichTurn.StartClock(state, ctx.Now), []);

            case LiveAction.VeDichCloseCurrentAnswer:
                return (VeDichTurn.CloseCurrentAnswer(state, ctx.Now), []);

            case LiveAction.VeDichBuzz buzz:
            {
                var questionId = state.Open?.Question.Id
                    ?? throw new RuleError("NOTHING_OPEN", "no question is open");
                var next = VeDichTurn.Buzz(state, buzz.PlayerId, ctx.Now);
                var buzzMs = next.Open?.BuzzerMs ?? 0;
                return (next, [Facts.Buzz(questionId, buzz.PlayerId, ctx.RoundId, buzzMs)]);
            }

            case LiveAction.VeDichResolve resolve:
            {
                var open = state.Open ?? throw new RuleError("NOTHING_OPEN", "no question is open");
                var face = open.Question.Value;
                var assignedTo = open.AssignedTo;
                var verdicts = new Verdicts(resolve.Answerer, resolve.Buzzer);
                var next = VeDichTurn.ResolveQuestion(state, verdicts);
                var facts = new List<LiveFact>();

                if (assignedTo is not null)
                {
                    static AnswerFact Teammate(string questionId, string userId, bool correct, int points) =>
                        Facts.Oral(questionId, userId, correct ? Verdict.CORRECT : Verdict.INCORRECT, points);

                    if (open.Buzzer is null)
                    {
                        var payout = VeDichScoring.Assign(face, null);
                        facts.Add(Teammate(open.Question.Id, open.Answerer, false, payout.Buzzer));
                        facts.Add(Teammate(open.Question.Id, assignedTo, false, payout.Partner));
                    }
                    else
                    {
                        var buzzerCorrect = resolve.Buzzer == true;
                        var other = open.Buzzer == open.Answerer ? assignedTo : open.Answerer;
                        var payout = VeDichScoring.Assign(face, buzzerCorrect);
                        facts.Add(Teammate(open.Question.Id, open.Buzzer, buzzerCorrect, payout.Buzzer));
                        facts.Add(Teammate(open.Question.Id, other, false, payout.Partner));
                    }
                    return (next, facts);
                }

                var answererPoints = VeDichScoring.Points(face, resolve.Answerer, ctx.Rules,
                    open.Power == Power.STAR);
                var verdict = resolve.Answerer ? Verdict.CORRECT : Verdict.INCORRECT;

                if (state.Phase == 1)
                {
                    var typed = ctx.Drafts.Any(d => d.UserId == open.Answerer);
                    if (typed)
                    {
                        facts.Add(new JudgeFact(open.Question.Id, open.Answerer, verdict, answererPoints));
                    }
                    else
                    {
                        facts.Add(Facts.Oral(open.Question.Id, open.Answerer, verdict, answererPoints));
                    }
                }
                else
                {
                    facts.Add(Facts.Oral(open.Question.Id, open.Answerer, verdict, answererPoints));
                    if (open.Buzzer is not null)
                    {
                        var buzzerCorrect = resolve.Buzzer == true;
                        facts.Add(Facts.Oral(open.Question.Id, open.Buzzer,
                            buzzerCorrect ? Verdict.CORRECT : Verdict.INCORRECT,
                            VeDichScoring.Points(face, buzzerCorrect, ctx.Rules)));
                    }
                }

                return (next, facts);
            }

            case LiveAction.VeDichAdvanceTurn:
                return (VeDichTurn.AdvanceTurn(state), []);

            case LiveAction.VeDichSetTurn setTurn:
                return (VeDichTurn.SetTurn(state, setTurn.PlayerId), []);

            case LiveAction.VeDichBeginPhase2:
                return (VeDichTurn.BeginPhase2(state), []);

            case LiveAction.VeDichEndRound:
                return (VeDichTurn.EndVeDich(state), []);

            default:
                throw new RuleError("VALIDATION", $"unhandled ve-dich action {action.Kind}");
        }
    }
}
