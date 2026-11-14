using System.Text.Json.Serialization;
using AOC.Domain.Engine.Scoring;

namespace AOC.Domain.Engine.Turns;

/// <summary>Port of turns/but-pha.ts — sprint questions with speed bands.</summary>
public sealed record ButPhaAnswer
{
    [JsonPropertyName("playerId")] public required string PlayerId { get; init; }
    [JsonPropertyName("correct")] public required bool Correct { get; init; }
    [JsonPropertyName("atS")] public required double AtS { get; init; }
}

public sealed record ButPhaState
{
    [JsonPropertyName("rules")] public RoundRules.ButPhaRules Rules { get; init; } = RoundRules.DefaultButPha();
    [JsonPropertyName("questionIds")] public List<string> QuestionIds { get; init; } = [];
    [JsonPropertyName("cursor")] public int Cursor { get; init; }
    [JsonPropertyName("questionOpenedAt")] public string? QuestionOpenedAt { get; init; }
    /// <summary>When the controller revealed the question — the clock waits for Tính giờ.</summary>
    [JsonPropertyName("questionRevealedAt")] public string? QuestionRevealedAt { get; init; }
    [JsonPropertyName("answers")] public Dictionary<string, List<ButPhaAnswer>> Answers { get; init; } = new();
    [JsonPropertyName("points")] public Dictionary<string, Dictionary<string, int>> Points { get; init; } = new();
    [JsonPropertyName("ended")] public bool Ended { get; init; }

    [JsonPropertyName("revealedAnswer")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? RevealedAnswer { get; init; }
}

public sealed record FinalResult(string PlayerId, bool Correct, double AtS);

public static class ButPhaTurn
{
    private static RuleError Err(string code, string message) => new(code, message);

    public static ButPhaState StartButPha(IEnumerable<string> questionIds, RoundRules.ButPhaRules? rules = null)
    {
        rules ??= RoundRules.DefaultButPha();
        var ids = questionIds.ToList();
        if (ids.Count != rules.QuestionCount)
            throw Err("VALIDATION", $"but-pha needs exactly {rules.QuestionCount} questions");
        return new ButPhaState { QuestionIds = ids, Rules = rules };
    }

    public static ButPhaState OpenCurrentQuestion(ButPhaState state, string openedAt)
    {
        if (state.Ended) throw Err("ENDED", "but-pha is over");
        if (state.QuestionRevealedAt is not null) throw Err("QUESTION_OPEN", "the question is already open");
        return state with { QuestionRevealedAt = openedAt, QuestionOpenedAt = null };
    }

    /// <summary>Tính giờ — the revealed question's clock starts here.</summary>
    public static ButPhaState StartClock(ButPhaState state, string nowIso)
    {
        if (state.Ended) throw Err("ENDED", "but-pha is over");
        if (state.QuestionRevealedAt is null) throw Err("QUESTION_NOT_REVEALED", "reveal the question first");
        return state with { QuestionOpenedAt = nowIso };
    }

    public static double ElapsedSeconds(ButPhaState state, string nowIso)
    {
        if (state.QuestionOpenedAt is null) throw Err("QUESTION_NOT_OPEN", "no question is open");
        return (DateTimeOffset.Parse(nowIso).ToUnixTimeMilliseconds()
            - DateTimeOffset.Parse(state.QuestionOpenedAt).ToUnixTimeMilliseconds()) / 1000.0;
    }

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

        var late = answer.AtS > state.Rules.QuestionLimitS || answer.AtS < 0;
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
            QuestionOpenedAt = null,
            QuestionRevealedAt = null,
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
            var late = result.AtS > state.Rules.QuestionLimitS || result.AtS < 0;
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
        => state.Ended ? state : state with { Ended = true, QuestionOpenedAt = null, QuestionRevealedAt = null };

    public static int ButPhaTotal(ButPhaState state, string playerId)
        => state.Points.Values.Sum(byPlayer => byPlayer.GetValueOrDefault(playerId));
}
