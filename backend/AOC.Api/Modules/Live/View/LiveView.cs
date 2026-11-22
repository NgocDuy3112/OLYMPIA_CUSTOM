using System.Text.Json;
using AOC.Api.Shared;
using AOC.Infrastructure.Data;
using AOC.Domain.Contracts;
using AOC.Domain.Gameplay;
using AOC.Domain.Gameplay.Turns;

namespace AOC.Api.Modules.Live;

public static partial class LiveView
{
    private static readonly string[] PublishesVerdicts = ["khoi-dong", "but-pha", "ve-dich", "giai-ma"];

    public sealed record ViewInput(
        string MatchId,
        string RoundId,
        int Version,
        string Now,
        string UserId,
        object State,
        List<SubmittedAnswerRow> Submitted,
        List<JudgedRow>? Judged = null,
        List<MatchQuestion>? Questions = null,
        List<ScoreRow>? Table = null,
        bool RevealAll = false,
        List<RevealedAnswerRow>? RevealedAnswers = null,
        IReadOnlyDictionary<string, int>? TieBreak = null);

    private static string PlusSeconds(string iso, double seconds)
    {
        var ms = DateTimeOffset.Parse(iso).ToUnixTimeMilliseconds() + (long)(seconds * 1000);
        return DateTimeOffset.FromUnixTimeMilliseconds(ms)
            .UtcDateTime.ToString("yyyy-MM-ddTHH:mm:ss.fffZ");
    }


    private static Dictionary<string, object?> Base(string matchId, string roundId, int version,
        string stage, List<object?> open, List<RankedScore> table, Dictionary<string, object?> me)
    {
        var view = new Dictionary<string, object?>
        {
            ["matchId"] = matchId,
            ["roundId"] = roundId,
            ["version"] = version,
            ["stage"] = stage,
            ["open"] = open,
            ["table"] = table,
            ["me"] = me
        };
        return view;
    }

    private static object? QuestionOf(ViewInput input, string questionId)
    {
        var question = (input.Questions ?? []).FirstOrDefault(q => q.Id == questionId);
        return question is null ? null : QuestionView.Sanitize(question);
    }

    private static string? DeadlineWhileOpen(AnswerWindow window, string nowIso)
        => window.IsOpen(nowIso) ? window.Deadline() : null;

    private static string? DeadlineOnceStarted(AnswerWindow window)
        => window.HasStarted ? window.Deadline() : null;

    private static bool WindowOpen(AnswerWindow window, string nowIso) => window.IsOpen(nowIso);

    private static Dictionary<string, object?> OpenEntry(string questionId, string? deadlineAt,
        object? question, long? frozenRemainingMs = null)
    {
        var entry = new Dictionary<string, object?>
        {
            ["questionId"] = questionId,
            ["deadlineAt"] = deadlineAt
        };
        if (frozenRemainingMs is not null) entry["frozenRemainingMs"] = frozenRemainingMs;
        entry["question"] = question;
        return entry;
    }

    public static List<RankedScore> RankTable(
        List<ScoreRow>? table, IReadOnlyDictionary<string, int>? tieBreak = null)
    {
        table ??= [];
        int TieOf(ScoreRow row)
            => tieBreak is not null && tieBreak.TryGetValue(row.Id, out var points) ? points : 0;

        var sorted = table
            .OrderByDescending(r => r.Points)
            .ThenByDescending(TieOf)
            .ToList();
        var rankById = new Dictionary<string, int>();
        var rank = 0;
        (int Points, int Tie)? last = null;
        for (var index = 0; index < sorted.Count; index++)
        {
            var row = sorted[index];
            var key = (row.Points, TieOf(row));
            if (last is null || key != last.Value)
            {
                rank = index + 1;
                last = key;
            }
            rankById[row.Id] = rank;
        }

        var ranked = new List<RankedScore>();
        foreach (var row in table)
            ranked.Add(new RankedScore(row.Id, row.DisplayName, row.Points, rankById[row.Id]));
        return ranked;
    }

    private static string StateOf(List<SubmittedAnswerRow> submitted, string questionId)
    {
        var row = submitted.FirstOrDefault(s => s.QuestionId == questionId);
        if (row is null) return "none";
        return "answered";
    }

    internal static MatchQuestion? QuestionMatchOf(ViewInput input, string? questionId)
    {
        if (questionId is null) return null;
        return (input.Questions ?? []).FirstOrDefault(q => q.Id == questionId);
    }

    internal sealed record SubmissionEcho(string Answer, double ElapsedS);

    internal static SubmissionEcho? MySubmissionOf(
        List<SubmittedAnswerRow> submitted, string? questionId, MatchQuestion? question)
    {
        if (questionId is null) return null;
        var row = submitted.FirstOrDefault(s => s.QuestionId == questionId);
        if (row is null) return null;
        if (row.Value is null) return null;
        var answer = QuestionView.AnswerRowDisplay(row.Value, question);
        if (answer is null) return null;
        var elapsedS = 0.0;
        if (row.AnsweredMs is { } ms) elapsedS = ms / 1000.0;
        return new SubmissionEcho(answer, Math.Round(elapsedS, 1));
    }

    private static Dictionary<string, string> VerdictsOf(List<SubmittedAnswerRow> submitted)
        => submitted
            .Where(row => row.Verdict is not null)
            .ToDictionary(row => row.QuestionId, row => row.Verdict!.Value.ToString());

    public static Dictionary<string, object?> BuildPlayerView(ViewInput input)
    {
        var view = WithReveal(input, RoundViewOf(input));
        if (!PublishesVerdicts.Contains(input.RoundId)) return view;

        var judged = (input.Judged ?? []).Where(row => row.Verdict is not null).ToList();
        if (judged.Count == 0) return view;

        view["publicVerdicts"] = judged.Select(row => (object)new Dictionary<string, object?>
        {
            ["questionId"] = row.QuestionId,
            ["userId"] = row.UserId,
            ["verdict"] = row.Verdict!.Value.ToString(),
            ["answeredMs"] = row.AnsweredMs
        }).ToList();
        return view;
    }

    private static Dictionary<string, object?> RoundViewOf(ViewInput input) => input.RoundId switch
    {
        "giai-ma" => GiaiMaView(input, (GiaiMaState)input.State),
        "but-pha" => ButPhaView(input, (ButPhaState)input.State),
        "khoi-dong" => KhoiDongView(input, (KhoiDongState)input.State),
        "ve-dich" => VeDichView(input, (VeDichState)input.State),
        _ => Base(input.MatchId, input.RoundId, input.Version, "unknown", [],
            RankTable(input.Table, input.TieBreak), [])
    };

    public static string? RevealedIdOf(object state) => state switch
    {
        GiaiMaState g => g.RevealedAnswer,
        ButPhaState b => b.RevealedAnswer,
        KhoiDongState k => k.RevealedAnswer,
        VeDichState v => v.RevealedAnswer,
        _ => null
    };

    private static Dictionary<string, object?> WithReveal(ViewInput input, Dictionary<string, object?> view)
    {
        var questionId = RevealedIdOf(input.State);
        if (questionId is null) return view;

        bool KhoiDongStillShowing(KhoiDongState state)
        {
            if (state.Flow == Flow.chung)
            {
                if (state.Phase2 is null) return false;
                return KhoiDongTurn.Phase2QuestionId(state.Phase2) == questionId;
            }

            var activeId = KhoiDongRound.ActivePlayerId(state);
            if (activeId is null) return false;
            if (!state.Runs.TryGetValue(activeId, out var run)) return false;
            if (run.Ended) return false;
            if (run.Cursor >= run.QuestionIds.Count) return false;
            return run.QuestionIds[run.Cursor] == questionId;
        }

        var stillShowing = input.RoundId switch
        {
            "khoi-dong" => KhoiDongStillShowing((KhoiDongState)input.State),
            "but-pha" => ButPhaTurn.OpenQuestionId((ButPhaState)input.State) == questionId,
            "ve-dich" => ((VeDichState)input.State).Open?.Question.Id == questionId,
            "giai-ma" =>
                ((GiaiMaState)input.State) is var gm && (
                    (input.Questions ?? []).FirstOrDefault(q => q.Kind == QuestionKind.KEYWORD)?.Id == questionId
                    || (gm.OpenHint ?? gm.Picked.LastOrDefault()) is { } current && current == questionId),
            _ => false
        };
        if (!stillShowing) return view;

        var question = (input.Questions ?? []).FirstOrDefault(q => q.Id == questionId);
        var contestants = new List<object?>();
        foreach (var row in input.RevealedAnswers ?? [])
        {
            var name = input.Table?.FirstOrDefault(t => t.Id == row.UserId)?.DisplayName ?? row.UserId;
            contestants.Add(new Dictionary<string, object?>
            {
                ["userId"] = row.UserId,
                ["name"] = name,
                ["answer"] = QuestionView.AnswerRowDisplay(row.Value, question),
                ["verdict"] = row.Verdict?.ToString(),
                ["answeredMs"] = row.AnsweredMs
            });
        }
        if (contestants.Count == 0) return view;

        view["revealed"] = new Dictionary<string, object?>
        {
            ["contestants"] = contestants
        };
        return view;
    }
}
