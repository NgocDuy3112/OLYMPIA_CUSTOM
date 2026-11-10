using Olympia.Domain.Contracts;
using Olympia.Domain.Engine;

namespace Olympia.Api.Modules.Live;

/// <summary>Port of live/apply.ts — versioned state mutation with facts.</summary>
public sealed record LiveRecord<S>(int Version, string RoundId, S State, Dictionary<string, S> Archive);

public sealed record Transition<S>(
    S State,
    List<LiveFact> Facts,
    string? RoundId = null,
    Dictionary<string, S>? Archive = null);

public sealed record AnswerDraft(
    string UserId,
    Verdict? Suggestion,
    int? AnsweredMs,
    bool Judged);

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
    public static void AssertVerdictCoverage(
        IReadOnlyList<AnswerDraft> drafts,
        IReadOnlyList<(string PlayerId, bool Correct)> verdicts,
        string what)
    {
        var submitters = drafts.Select(d => d.UserId).ToHashSet();
        foreach (var (playerId, _) in verdicts)
            if (!submitters.Contains(playerId))
                throw new RuleError("NO_ANSWER", $"no submitted answer from {playerId} to judge");

        var staged = verdicts.Select(v => v.PlayerId).ToHashSet();
        foreach (var draft in drafts)
            if (!draft.Judged && !staged.Contains(draft.UserId))
                throw new RuleError("UNJUDGED_ANSWERS",
                    $"judge every submitted answer before {what}");
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

internal sealed record RecordView<S>(LiveRecord<S> Inner) : ILiveRecordView<S>
{
    public int Version => Inner.Version;
    public string RoundId => Inner.RoundId;
    public S State => Inner.State;
    public Dictionary<string, S> Archive => Inner.Archive;
}
