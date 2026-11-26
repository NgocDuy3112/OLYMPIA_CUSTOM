using AOC.Api.Shared;
using AOC.Domain.Contracts;
using AOC.Domain.Gameplay.Turns;
using AOC.Infrastructure.Data.Entities;

namespace AOC.Api.Modules.Live.TieBreak;

public static class TieBreakViews
{
    public static TieBreakView Build(
        string matchId,
        int version,
        TieBreakState state,
        string nowIso,
        IReadOnlyDictionary<string, QuestionBankEntity> questions,
        IReadOnlyDictionary<string, string> displayNames,
        string? meId)
    {
        var ranks = TieBreakTurn.RankWithTieBreak(
            state.Players.Select(id => new RankedEntry(id, 0)).ToList(),
            state.Correct,
            state.BuzzMs);

        var players = state.Players
            .Select(id => new TieBreakPlayerView(
                id,
                displayNames[id],
                TieBreakTurn.TieBreakScore(state, id),
                ranks[id],
                state.Eliminated.Contains(id)))
            .ToList();

        var current = TieBreakTurn.CurrentQuestionId(state);
        SanitizedQuestion? question = null;
        if (current is not null)
        {
            if (!questions.TryGetValue(current, out var bank))
                throw new RuleError("QUESTION_NOT_FOUND", $"tie-break question {current} is not in the bank");
            question = QuestionView.Sanitize(bank);
        }

        return new TieBreakView(
            matchId,
            version,
            "tiebreak",
            current,
            state.Cursor,
            state.Ended,
            state.Window,
            state.Window.IsOpen(nowIso),
            state.Window.Deadline(),
            players,
            meId is null ? null : players.FirstOrDefault(p => p.Id == meId),
            question);
    }
}
