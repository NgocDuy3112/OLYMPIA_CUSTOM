using System.Text.Json;
using AOC.Api.Shared;
using AOC.Infrastructure.Data;
using AOC.Domain.Contracts;
using AOC.Domain.Gameplay;
using AOC.Domain.Gameplay.Turns;

namespace AOC.Api.Modules.Live;

public static partial class LiveView
{
    private static Dictionary<string, object?> ButPhaView(ViewInput input, ButPhaState state)
    {
        var questionId = ButPhaTurn.OpenQuestionId(state);
        var open = new List<object?>();

        if (questionId is not null && state.QuestionRevealedAt is not null)
        {
            open.Add(OpenEntry(questionId, DeadlineOnceStarted(state.Window),
                QuestionOf(input, questionId)));
        }

        var me = new Dictionary<string, object?>
        {
            ["points"] = ButPhaTurn.ButPhaTotal(state, input.UserId),
            ["answerState"] = questionId is null ? "none" : StateOf(input.Submitted, questionId),
            ["verdicts"] = VerdictsOf(input.Submitted)
        };

        return Base(input.MatchId, input.RoundId, input.Version,
            state.Ended ? "ended" : "question", open, RankTable(input.Table, input.TieBreak), me);
    }
}
