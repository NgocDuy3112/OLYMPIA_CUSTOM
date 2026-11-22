using System.Text.Json;
using AOC.Api.Shared;
using AOC.Infrastructure.Data;
using AOC.Domain.Contracts;
using AOC.Domain.Gameplay;
using AOC.Domain.Gameplay.Turns;

namespace AOC.Api.Modules.Live;

public static partial class LiveView
{
    private static Dictionary<string, object?> KhoiDongView(ViewInput input, KhoiDongState state)
    {
        if (state.Flow == Flow.rieng)
        {
            var activeId = KhoiDongRound.ActivePlayerId(state);
            var run = activeId is not null ? state.Runs[activeId] : null;
            var currentId = run is not null && !run.Ended && run.Cursor < run.QuestionIds.Count
                ? run.QuestionIds[run.Cursor]
                : null;

            var me = new Dictionary<string, object?>
            {
                ["isMyRun"] = activeId == input.UserId,
                ["points"] = KhoiDongRound.KhoiDongPoints(state, input.UserId),
                ["verdicts"] = VerdictsOf(input.Submitted)
            };

            var view = Base(input.MatchId, input.RoundId, input.Version,
                state.Ended ? "ended" : "phase1", [], RankTable(input.Table, input.TieBreak), me);
            view["selectedPlayerId"] = activeId;
            if (run is not null && currentId is not null)
            {
                view["oral"] = new Dictionary<string, object?>
                {
                    ["questionId"] = currentId,
                    ["question"] = state.ClockStarted ? QuestionOf(input, currentId) : null,
                    ["playerId"] = activeId,
                    ["index"] = run.Cursor,
                    ["total"] = run.QuestionIds.Count,
                    ["elapsedS"] = run.ElapsedS,
                    ["budgetS"] = run.BudgetS,
                    ["deadlineAt"] = state.ClockStartedAt is null
                        ? null
                        : PlusSeconds(state.ClockStartedAt, run.BudgetS)
                };
            }
            else
            {
                view["oral"] = null;
            }
            return view;
        }

        var p2 = state.Phase2;
        var qid = p2 is null ? null : KhoiDongTurn.Phase2QuestionId(p2);
        var windowOpen = p2 is not null && !p2.Closed && WindowOpen(p2.Window, input.Now);

        var open = new List<object?>();
        if (qid is not null && p2 is not null)
        {
            open.Add(OpenEntry(qid, DeadlineOnceStarted(p2.Window), QuestionOf(input, qid)));
        }
        // with Index = -1 nothing is picked yet: qid is null, so no question leaks

        var p2me = new Dictionary<string, object?>
        {
            ["points"] = KhoiDongRound.KhoiDongPoints(state, input.UserId),
            ["answerState"] = qid is null ? "none" : StateOf(input.Submitted, qid),
            ["mySubmission"] = MySubmissionOf(input.Submitted, qid, QuestionMatchOf(input, qid)),
            ["windowOpen"] = windowOpen,
            ["questionIndex"] = p2?.Index ?? 0,
            ["questionCount"] = p2?.QuestionIds.Count ?? 0,
            ["verdicts"] = VerdictsOf(input.Submitted)
        };

        var phase2View = Base(input.MatchId, input.RoundId, input.Version,
            state.Ended ? "ended" : "phase2", open, RankTable(input.Table, input.TieBreak), p2me);
        phase2View["selectedPlayerId"] = null;
        return phase2View;
    }
}
