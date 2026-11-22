using AOC.Domain.Contracts;
using AOC.Domain.Gameplay.Scoring;

namespace AOC.Domain.Gameplay.Turns;

public static class ButPhaTurn
{
    private static RuleError Err(string code, string message) => new(code, message);

    public static ButPhaState StartButPha(IEnumerable<string> questionIds, RoundRules.ButPhaRules? rules = null)
    {
        rules ??= RuleBatches.ButPha;
        var ids = questionIds.ToList();
        if (ids.Count != rules.QuestionCount)
            throw Err("VALIDATION", $"but-pha needs exactly {rules.QuestionCount} questions — got {ids.Count} assembled into this match");
        return new ButPhaState
        {
            QuestionIds = ids,
            Rules = rules,
            Window = AnswerWindow.TypedEveryone(rules.QuestionLimitS)
        };
    }

    public static ButPhaState OpenCurrentQuestion(ButPhaState state, string openedAt)
    {
        if (state.Ended) throw Err("ENDED", "but-pha is over");
        if (state.QuestionRevealedAt is not null) throw Err("QUESTION_OPEN", "the question is already open");
        return state with { QuestionRevealedAt = openedAt, Window = FreshWindow(state) };
    }

    public static ButPhaState StartClock(ButPhaState state, string nowIso)
    {
        if (state.Ended) throw Err("ENDED", "but-pha is over");
        if (state.QuestionRevealedAt is null) throw Err("QUESTION_NOT_REVEALED", "reveal the question first");
        return state with { Window = state.Window.OpenFor(nowIso, state.Rules.QuestionLimitS) };
    }

    public static double ElapsedSeconds(ButPhaState state, string nowIso)
        => state.Window.ElapsedMs(nowIso) / 1000.0;

    public static string? OpenQuestionId(ButPhaState state)
    {
        if (state.Ended) return null;
        if (state.Cursor >= state.QuestionIds.Count) return null;
        return state.QuestionIds[state.Cursor];
    }

    public static ButPhaState SubmitAnswer(ButPhaState state, ButPhaAnswer answer)
    {
        if (state.Ended) throw Err("ENDED", "but-pha is over");
        var qid = state.QuestionIds[state.Cursor];

        var existing = state.Answers.TryGetValue(qid, out var list) ? list : [];
        if (existing.Any(a => a.PlayerId == answer.PlayerId))
            throw Err("ALREADY_ANSWERED", "this player already answered this question");

        var late = IsLate(state, answer.AtS);
        var effective = late ? answer with { Correct = false } : answer;

        var answers = new Dictionary<string, List<ButPhaAnswer>>(state.Answers)
        {
            [qid] = [.. existing, effective]
        };

        var points = state.Points;
        if (effective.Correct)
        {
            var order = answers[qid].Count(a => a.Correct);
            var speed = state.Rules.AsSpeedBands();
            var pts = ButPhaScoring.BasePointsForTime(effective.AtS, state.Rules.Bands)
                * ButPhaScoring.SpeedMultiplier(order, speed);
            var byPlayer = points.TryGetValue(qid, out var map)
                ? new Dictionary<string, int>(map)
                : new Dictionary<string, int>();
            byPlayer[effective.PlayerId] = pts;
            points = new Dictionary<string, Dictionary<string, int>>(points)
            {
                [qid] = byPlayer
            };
        }

        return state with { Answers = answers, Points = points };
    }

    public static ButPhaState CloseQuestion(ButPhaState state)
    {
        if (state.Ended) throw Err("ENDED", "but-pha is over");
        var cursor = state.Cursor + 1;
        return state with
        {
            Cursor = cursor,
            QuestionRevealedAt = null,
            Window = FreshWindow(state),
            Ended = cursor >= state.Rules.QuestionCount
        };
    }

    public static ButPhaState FinalizeQuestion(ButPhaState state, IReadOnlyList<FinalResult> results)
    {
        if (state.Ended) throw Err("ENDED", "but-pha is over");
        var qid = state.QuestionIds[state.Cursor];
        if (state.Answers.ContainsKey(qid))
            throw Err("ALREADY_FINALIZED", $"question {qid} is already finalized");
        if (results.Select(r => r.PlayerId).Distinct().Count() != results.Count)
            throw Err("VALIDATION", "a player may be finalized only once per question");

        var ordered = results.OrderBy(r => r.AtS).ToList();
        var answers = new List<ButPhaAnswer>();
        var pointsFor = new Dictionary<string, int>();
        var correctSoFar = 0;
        var speed = state.Rules.AsSpeedBands();

        foreach (var result in ordered)
        {
            var late = IsLate(state, result.AtS);
            var correct = result.Correct && !late;
            if (correct)
            {
                correctSoFar += 1;
                pointsFor[result.PlayerId] = ButPhaScoring.BasePointsForTime(result.AtS, state.Rules.Bands)
                    * ButPhaScoring.SpeedMultiplier(correctSoFar, speed);
            }
            else
            {
                pointsFor[result.PlayerId] = 0;
            }
            answers.Add(new ButPhaAnswer { PlayerId = result.PlayerId, Correct = correct, AtS = result.AtS });
        }

        var newAnswers = new Dictionary<string, List<ButPhaAnswer>>(state.Answers) { [qid] = answers };
        var newPoints = new Dictionary<string, Dictionary<string, int>>(state.Points) { [qid] = pointsFor };
        return state with { Answers = newAnswers, Points = newPoints };
    }

    public static ButPhaState EndButPha(ButPhaState state)
        => state.Ended ? state : state with { Ended = true, QuestionRevealedAt = null, Window = FreshWindow(state) };

    private static AnswerWindow FreshWindow(ButPhaState state)
        => AnswerWindow.TypedEveryone(state.Rules.QuestionLimitS);

    private static bool IsLate(ButPhaState state, double atS)
    {
        if (atS < 0) return true;
        return atS > state.Rules.QuestionLimitS;
    }

    public static int ButPhaTotal(ButPhaState state, string playerId)
        => state.Points.Values.Sum(byPlayer => byPlayer.GetValueOrDefault(playerId));
}
