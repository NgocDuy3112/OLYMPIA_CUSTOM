using Microsoft.EntityFrameworkCore;
using AOC.Api.Http;
using AOC.Api.Modules.Matches;
using AOC.Api.Modules.Questions;
using AOC.Api.Realtime;
using AOC.Domain.Contracts;
using AOC.Domain.Gameplay.Turns;
using AOC.Infrastructure.Data;
using AOC.Infrastructure.Data.Entities;

namespace AOC.Api.Modules.Live.TieBreak;

public sealed class TieBreakService(
    AOCDbContext db,
    MatchesService matches,
    QuestionsService questions,
    LiveReader reader,
    MatchHubRegistry hubs)
{
    public const int QuestionCount = 5;

    public async Task<TieBreakState?> GetStateAsync(Guid matchId)
        => (await reader.ReadLiveAsync(matchId))?.TieBreak;

    public async Task<TieBreakView?> ViewAsync(Guid matchId, Guid? meId)
    {
        var live = await reader.ReadLiveAsync(matchId);
        if (live?.TieBreak is not { } state) return null;

        var questionIds = state.QuestionIds.Select(Guid.Parse).Distinct().ToList();
        var bank = await db.QuestionBank.AsNoTracking()
            .Where(q => questionIds.Contains(q.Id))
            .ToListAsync();
        var questionById = bank.ToDictionary(q => q.Id.ToString());

        var playerIds = state.Players.Select(Guid.Parse).Distinct().ToList();
        var names = await db.Users.AsNoTracking()
            .Where(u => playerIds.Contains(u.Id))
            .Select(u => new { u.Id, u.DisplayName })
            .ToDictionaryAsync(u => u.Id.ToString(), u => u.DisplayName);

        return TieBreakViews.Build(
            matchId.ToString(), live.Version, state, Now(), questionById, names, meId?.ToString());
    }

    public async Task<TieBreakState> StartAsync(
        Guid matchId, IReadOnlyList<string> playerIds, int expectedVersion)
    {
        var match = await matches.GetMatchByIdAsync(matchId.ToString());
        if (match.Status != MatchStatus.LIVE) throw ApiException.Conflict("match is not LIVE");

        var seated = match.PlayersList
            .Where(seat => seat.Kind == "user")
            .Select(seat => seat.UserId)
            .ToHashSet();
        if (playerIds.Any(id => !seated.Contains(id)))
            throw ApiException.Forbidden("tie-break players must be seated in this match");

        var bank = await questions.TieBreakQuestionsAsync(QuestionCount);
        if (bank.Count < QuestionCount)
            throw new RuleError("NOT_ENOUGH_TIEBREAK_QUESTIONS",
                $"tie-break needs {QuestionCount} questions, got {bank.Count}");

        var state = TieBreakTurn.StartTieBreak(
            playerIds, bank.Select(question => question.Id.ToString()).ToList());

        var store = new TieBreakStore(db, matchId);
        var next = await store.Transact(tx =>
        {
            LiveConflictError.AssertVersion(expectedVersion, tx.Version);
            if (tx.Load() is { Ended: false })
                throw new RuleError("TIEBREAK_ALREADY_RUNNING", "a tie-break is already running");
            tx.Save(state);
            return Task.FromResult(state);
        });

        await hubs.PublishAsync(matchId.ToString());
        return next;
    }

    public Task<TieBreakState> OpenBuzzAsync(Guid matchId, int expectedVersion)
        => MutateAsync(matchId, expectedVersion, state => TieBreakTurn.OpenBuzz(state, Now()));

    public Task<TieBreakState> LockBuzzAsync(Guid matchId, int expectedVersion)
        => MutateAsync(matchId, expectedVersion, TieBreakTurn.LockBuzz);

    public Task<TieBreakState> BuzzAsync(Guid matchId, Guid playerId)
        => MutateAsync(matchId, -1, state => TieBreakTurn.Buzz(state, playerId.ToString(), Now()));

    public Task<TieBreakState> JudgeAsync(Guid matchId, bool correct, int expectedVersion)
        => MutateAsync(matchId, expectedVersion, state => TieBreakTurn.Judge(state, correct));

    public Task<TieBreakState> AdvanceAsync(Guid matchId, int expectedVersion)
        => MutateAsync(matchId, expectedVersion, TieBreakTurn.Advance);

    public Task<TieBreakState> EndAsync(Guid matchId, int expectedVersion)
        => MutateAsync(matchId, expectedVersion, TieBreakTurn.EndTieBreak, allowEnded: true);

    private async Task<TieBreakState> MutateAsync(
        Guid matchId,
        int expectedVersion,
        Func<TieBreakState, TieBreakState> change,
        bool allowEnded = false)
    {
        var store = new TieBreakStore(db, matchId);
        var next = await store.Transact(tx =>
        {
            LiveConflictError.AssertVersion(expectedVersion, tx.Version);
            var current = tx.Load()
                ?? throw new RuleError("NO_TIEBREAK", "no tie-break is running");
            if (current.Ended && allowEnded) return Task.FromResult(current);
            if (current.Ended) throw new RuleError("TIEBREAK_ENDED", "the tie-break has ended");

            var updated = change(current);
            tx.Save(updated);
            return Task.FromResult(updated);
        });

        await hubs.PublishAsync(matchId.ToString());
        return next;
    }

    private static string Now()
        => DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ");
}
