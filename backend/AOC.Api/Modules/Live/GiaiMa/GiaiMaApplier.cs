using AOC.Domain.Contracts;
using AOC.Domain.Gameplay.Turns;

namespace AOC.Api.Modules.Live;

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

            case LiveAction.GiaiMaStartKeywordWindow:
                return (GiaiMaTurn.StartKeywordCountdown(state, ctx.Now), []);

            case LiveAction.GiaiMaLockHints:
            {
                if (state.OpenHint is null) throw new RuleError("NO_OPEN_HINT", "no hint is open to lock");
                var answers = ctx.AnswerDrafts.ToDictionary(
                    d => d.UserId, d => d.Suggestion == Verdict.CORRECT);
                var next = GiaiMaTurn.LockOpenHint(state, answers);
                var facts = ctx.AnswerDrafts.Select(d => (LiveFact)new JudgeFact(
                    state.OpenHint!, d.UserId,
                    d.Suggestion == Verdict.CORRECT ? Verdict.CORRECT : Verdict.INCORRECT,
                    0)).ToList();
                return (next, facts);
            }

            case LiveAction.GiaiMaStartWindow:
                return (GiaiMaTurn.StartWindow(state, ctx.Now), []);

            case LiveAction.GiaiMaCloseHintWindow:
                return (GiaiMaTurn.CloseHintWindow(state), []);

            case LiveAction.GiaiMaResolveHint resolve:
            {
                var covered = global::AOC.Api.Modules.Live.Apply.CoveredVerdicts(
                    ctx.AnswerDrafts, resolve.Verdicts);
                var answers = covered.ToDictionary(v => v.PlayerId, v => v.Correct);
                var next = GiaiMaTurn.ResolveOpenHint(state, answers);
                var openHint = state.OpenHint!;
                var facts = covered.Select(v => (LiveFact)new JudgeFact(
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
