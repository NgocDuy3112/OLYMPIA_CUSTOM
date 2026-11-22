using AOC.Domain.Contracts;
using AOC.Domain.Gameplay;
using AOC.Domain.Gameplay.Turns;

namespace AOC.Api.Modules.Live;

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
                    if (!times.TryGetValue(playerId, out var answeredMs))
                        throw new RuleError("NO_ANSWER", $"no submitted answer from {playerId}");
                    if (answeredMs is null)
                        throw new RuleError("NO_ANSWER", $"answer from {playerId} has no elapsed time");
                    results.Add(new FinalResult(playerId, correct, answeredMs.Value / 1000.0));
                }

                var next = ButPhaTurn.FinalizeQuestion(state, results);

                var recorded = new Dictionary<string, bool>();
                if (next.Answers.TryGetValue(questionId, out var recordedAnswers))
                    recorded = recordedAnswers.ToDictionary(a => a.PlayerId, a => a.Correct);
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
