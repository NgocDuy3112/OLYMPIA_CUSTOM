using AOC.Domain.Contracts;
using AOC.Domain.Gameplay;
using AOC.Domain.Gameplay.Turns;

namespace AOC.Api.Modules.Live;

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

                var next = KhoiDongRound.RecordOral(
                    state, recordOral.Correct, recordOral.SpentS, recordOral.PlayerId, ctx.Now);

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

            case LiveAction.KhoiDongStartClock:
                return (KhoiDongRound.StartClock(state, ctx.Now), []);

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
