using AOC.Domain.Contracts;
using AOC.Domain.Gameplay;
using AOC.Domain.Gameplay.Scoring;
using AOC.Domain.Gameplay.Turns;

namespace AOC.Api.Modules.Live;

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
                    Score = p.Score,
                    Powers = PowerSet.Fresh()
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

            case LiveAction.VeDichConfirmPicks:
                return (VeDichTurn.ConfirmPicks(state), []);

            case LiveAction.VeDichDeclarePower declare:
                return (VeDichTurn.DeclarePower(state, declare.PlayerId, declare.PowerValue, declare.TargetId), []);

            case LiveAction.VeDichOpenQuestion openQuestion:
            {
                var answerer = VeDichTurn.CurrentPlayer(state).Id;
                var staged = state.Players.First(p => p.Id == answerer).Powers.Staged;
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

            case LiveAction.VeDichOpenPending openPending:
                return (VeDichTurn.OpenPending(state, openPending.QuestionId), []);

            case LiveAction.VeDichSwitchQuestion switchQuestion:
                return (VeDichTurn.SwitchPhase2Question(state, switchQuestion.QuestionId), []);

            case LiveAction.VeDichCloseQuestion:
                return (VeDichTurn.CloseQuestion(state), []);

            case LiveAction.VeDichNextQuestion:
                return (VeDichTurn.NextQuestion(state), []);

            case LiveAction.VeDichClearPicks:
                return (VeDichTurn.ClearPicks(state), []);

            case LiveAction.VeDichJudge judge:
            {
                if (state.Phase != 1) throw new RuleError("WRONG_PHASE", "judge only applies in phase 1");
                var open = state.Open ?? throw new RuleError("NOTHING_OPEN", "no question is open");
                // A player who never answered still gets graded — always as wrong.
                var correct = judge.Correct && ctx.Drafts.Any(d => d.UserId == judge.PlayerId);
                var points = VeDichScoring.Points(open.Question.Value, correct, ctx.Rules);
                return (state, [new JudgeFact(open.Question.Id, judge.PlayerId,
                    correct ? Verdict.CORRECT : Verdict.INCORRECT, points)]);
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
                var buzzMs = next.Open?.Window.BuzzerMs ?? 0;
                return (next, [Facts.Buzz(questionId, buzz.PlayerId, ctx.RoundId, buzzMs)]);
            }

            case LiveAction.VeDichResolve resolve:
            {
                var open = state.Open ?? throw new RuleError("NOTHING_OPEN", "no question is open");
                var face = open.Question.Value;
                var assignedTo = open.Window.Eligibility == AnswerEligibility.Pair
                    ? open.Window.PairB
                    : null;
                var verdicts = new Verdicts(resolve.Answerer, resolve.Buzzer);
                var next = VeDichTurn.ResolveQuestion(state, verdicts);
                var facts = new List<LiveFact>();

                if (assignedTo is not null)
                {
                    static AnswerFact Teammate(string questionId, string userId, bool correct, int points) =>
                        Facts.Oral(questionId, userId, correct ? Verdict.CORRECT : Verdict.INCORRECT, points);

                    if (open.Window.Buzzer is null)
                    {
                        var payout = VeDichScoring.Assign(face, null, ctx.Rules.Assign);
                        facts.Add(Teammate(open.Question.Id, open.Answerer, false, payout.Buzzer));
                        facts.Add(Teammate(open.Question.Id, assignedTo, false, payout.Partner));
                    }
                    else
                    {
                        var buzzerCorrect = resolve.Buzzer == true;
                        var other = open.Window.Buzzer == open.Answerer ? assignedTo : open.Answerer;
                        var payout = VeDichScoring.Assign(face, buzzerCorrect, ctx.Rules.Assign);
                        facts.Add(Teammate(open.Question.Id, open.Window.Buzzer, buzzerCorrect, payout.Buzzer));
                        facts.Add(Teammate(open.Question.Id, other, false, payout.Partner));
                    }
                    return (next, facts);
                }

                var answererPoints = VeDichScoring.Points(face, resolve.Answerer, ctx.Rules,
                    open.Power == PowerKind.STAR);
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
                    if (open.Window.Buzzer is not null)
                    {
                        var buzzerCorrect = resolve.Buzzer == true;
                        facts.Add(Facts.Oral(open.Question.Id, open.Window.Buzzer,
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
