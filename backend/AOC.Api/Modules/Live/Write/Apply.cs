using AOC.Domain.Contracts;

namespace AOC.Api.Modules.Live;

public interface ILiveTx<S>
{
    Task<LiveRecord<S>> Load();
    Task Save(LiveRecord<S> next);
    Task RecordFacts(List<LiveFact> facts);
    Task<List<AnswerDraft>> ReadAnswerDrafts(Guid questionId);
}

public interface ILiveStore<S>
{
    Task<T> Transact<T>(Func<ILiveTx<S>, Task<T>> fn);
}

public static class Apply
{
    public static List<(string PlayerId, bool Correct)> CoveredVerdicts(
        IReadOnlyList<AnswerDraft> drafts,
        IReadOnlyList<(string PlayerId, bool Correct)> verdicts)
    {
        var submitters = drafts.Select(d => d.UserId).ToHashSet();
        return verdicts.Where(v => submitters.Contains(v.PlayerId)).ToList();
    }

    public static async Task<LiveRecord<S>> MutateLive<S>(
        ILiveStore<S> store,
        Func<ILiveTx<S>, Task<Transition<S>>> transition)
    {
        return await store.Transact(async tx =>
        {
            var current = await tx.Load();
            var (state, facts, roundId, archive) = await transition(tx);
            var next = new LiveRecord<S>(
                current.Version + 1,
                roundId ?? current.RoundId,
                state,
                archive ?? current.Archive);
            await tx.Save(next);
            if (facts.Count > 0) await tx.RecordFacts(facts);
            return next;
        });
    }

    public static async Task<LiveRecord<S>> ApplyLiveAction<S>(
        ILiveStore<S> store,
        int expectedVersion,
        Func<ILiveRecordView<S>, ILiveTx<S>, Task<Transition<S>>> transition)
    {
        return await store.Transact(async tx =>
        {
            var current = await tx.Load();
            LiveConflictError.AssertVersion(expectedVersion, current.Version);

            var (state, facts, roundId, archive) = await transition(new RecordView<S>(current), tx);
            var next = new LiveRecord<S>(
                current.Version + 1,
                roundId ?? current.RoundId,
                state,
                archive ?? current.Archive);
            await tx.Save(next);
            if (facts.Count > 0) await tx.RecordFacts(facts);
            return next;
        });
    }
}

public interface ILiveRecordView<S>
{
    int Version { get; }
    string RoundId { get; }
    S State { get; }
    Dictionary<string, S> Archive { get; }
}
