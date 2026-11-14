using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using AOC.Api.Http;
using AOC.Domain.Contracts;
using AOC.Domain.Engine;
using AOC.Infrastructure.Data;
using AOC.Infrastructure.Data.Entities;

namespace AOC.Api.Modules.Live;

/// <summary>Port of live/store.ts — the Postgres-backed live store and readers.</summary>
public sealed class PgLiveStore(AOCDbContext db, Guid matchId) : ILiveStore<JsonElement>
{
    public async Task<T> Transact<T>(Func<ILiveTx<JsonElement>, Task<T>> fn)
    {
        await using var transaction = await db.Database.BeginTransactionAsync();

        // SELECT ... FOR UPDATE — serializes concurrent console/player mutations.
        var row = await db.MatchLive
            .FromSqlInterpolated($"SELECT * FROM match_live WHERE match_id = {matchId} FOR UPDATE")
            .FirstOrDefaultAsync();

        if (row is null) throw new LiveNotFoundError(matchId.ToString());

        var result = await fn(new PgLiveTx(db, matchId, row));
        await transaction.CommitAsync();
        return result;
    }
}

internal sealed class PgLiveTx(AOCDbContext db, Guid matchId, MatchLiveEntity row) : ILiveTx<JsonElement>
{
    public Task<LiveRecord<JsonElement>> Load() => Task.FromResult(new LiveRecord<JsonElement>(
        row.Version,
        row.RoundId,
        row.State,
        DeserializeArchive(row.Archive)));

    private static Dictionary<string, JsonElement> DeserializeArchive(JsonElement archive)
        => archive.ValueKind == JsonValueKind.Object
            ? archive.Deserialize<Dictionary<string, JsonElement>>(JsonApi.Options) ?? []
            : [];

    public async Task Save(LiveRecord<JsonElement> next)
    {
        row.Version = next.Version;
        row.RoundId = next.RoundId;
        row.State = next.State;
        row.Archive = JsonSerializer.SerializeToElement(next.Archive, JsonApi.Options);
        row.UpdatedAt = DateTime.UtcNow;
        // Flush the row INSIDE the transaction — committing without this only
        // commits whatever facts happened to be staged, so a transition with no
        // facts (round.goTo, *.start) returned a version that never landed.
        await db.SaveChangesAsync();
    }

    public async Task RecordFacts(List<LiveFact> facts)
    {
        // draft inserts
        var drafts = facts.OfType<DraftFact>().ToList();
        if (drafts.Count > 0)
        {
            var existing = await ExistingAnswerKeysAsync(
                drafts.Select(d => (d.QuestionId, d.UserId)).ToList());
            foreach (var draft in drafts)
            {
                if (existing.Contains((draft.QuestionId, draft.UserId))) continue;
                db.Answers.Add(new AnswerEntity
                {
                    MatchId = matchId,
                    QuestionId = Guid.Parse(draft.QuestionId),
                    UserId = Guid.Parse(draft.UserId),
                    Value = draft.Value,
                    Drafts = JsonSerializer.SerializeToElement(
                        new Dictionary<string, Verdict> { ["auto"] = draft.Suggestion }, JsonApi.Options),
                    Judged = false
                });
            }
        }

        // answer inserts (already final)
        var answers = facts.OfType<AnswerFact>().ToList();
        if (answers.Count > 0)
        {
            var existing = await ExistingAnswerKeysAsync(
                answers.Select(a => (a.QuestionId, a.UserId)).ToList());
            foreach (var answer in answers)
            {
                if (existing.Contains((answer.QuestionId, answer.UserId))) continue;
                db.Answers.Add(new AnswerEntity
                {
                    MatchId = matchId,
                    QuestionId = Guid.Parse(answer.QuestionId),
                    UserId = Guid.Parse(answer.UserId),
                    Value = answer.Value,
                    AutoMatched = answer.AutoMatched,
                    Judged = true,
                    Verdict = answer.Verdict,
                    PointsAwarded = answer.PointsAwarded
                });
            }
        }

        // judge updates
        foreach (var judge in facts.OfType<JudgeFact>())
        {
            var target = await db.Answers.FirstOrDefaultAsync(a =>
                a.MatchId == matchId
                && a.QuestionId == Guid.Parse(judge.QuestionId)
                && a.UserId == Guid.Parse(judge.UserId));
            if (target is null)
                throw new RuleError("NO_ANSWER",
                    $"no submitted answer to judge for question {judge.QuestionId}");
            target.Verdict = judge.Verdict;
            target.Judged = true;
            target.PointsAwarded = judge.PointsAwarded;
        }

        // match events (ON CONFLICT DO NOTHING on the partial uniques)
        foreach (var evt in facts.OfType<EventFact>())
        {
            var questionId = Guid.Parse(evt.QuestionId);
            var userId = Guid.Parse(evt.UserId);

            bool duplicate;
            if (evt.Kind == MatchEventKind.PICK)
            {
                duplicate = await db.MatchEvents.AnyAsync(e =>
                    e.MatchId == matchId && e.QuestionId == questionId
                    && e.Kind == AOC.Infrastructure.Data.MatchEventKind.PICK);
            }
            else if (evt.Kind == MatchEventKind.BUZZ)
            {
                duplicate = await db.MatchEvents.AnyAsync(e =>
                    e.MatchId == matchId && e.QuestionId == questionId && e.UserId == userId
                    && e.Kind == AOC.Infrastructure.Data.MatchEventKind.BUZZ);
            }
            else
            {
                var powers = await db.MatchEvents.AsNoTracking()
                    .Where(e => e.MatchId == matchId && e.UserId == userId
                        && e.Kind == AOC.Infrastructure.Data.MatchEventKind.POWER)
                    .Select(e => e.Payload)
                    .ToListAsync();
                var wanted = evt.Payload.TryGetProperty("power", out var pw) ? pw.GetString() : null;
                duplicate = powers.Any(p => p.TryGetProperty("power", out var existing)
                    && existing.GetString() == wanted);
            }
            if (duplicate) continue;

            db.MatchEvents.Add(new MatchEventEntity
            {
                MatchId = matchId,
                QuestionId = questionId,
                UserId = userId,
                RoundId = evt.RoundId,
                Kind = evt.Kind switch
                {
                    MatchEventKind.PICK => AOC.Infrastructure.Data.MatchEventKind.PICK,
                    MatchEventKind.BUZZ => AOC.Infrastructure.Data.MatchEventKind.BUZZ,
                    _ => AOC.Infrastructure.Data.MatchEventKind.POWER
                },
                Payload = evt.Payload,
                At = DateTime.UtcNow
            });
        }

        // score adjustments
        foreach (var adjust in facts.OfType<AdjustFact>())
        {
            db.ScoreAdjustments.Add(new ScoreAdjustmentEntity
            {
                MatchId = matchId,
                UserId = Guid.Parse(adjust.UserId),
                Delta = adjust.Delta,
                Reason = adjust.Reason,
                CreatedBy = Guid.Parse(adjust.ActorId)
            });
        }

        await db.SaveChangesAsync();
    }

    private async Task<HashSet<(string QuestionId, string UserId)>> ExistingAnswerKeysAsync(
        List<(string QuestionId, string UserId)> keys)
    {
        var questionIds = keys.Select(k => Guid.Parse(k.QuestionId)).Distinct().ToList();
        var userIds = keys.Select(k => Guid.Parse(k.UserId)).Distinct().ToList();
        var rows = await db.Answers.AsNoTracking()
            .Where(a => a.MatchId == matchId
                && questionIds.Contains(a.QuestionId)
                && userIds.Contains(a.UserId))
            .Select(a => new { QuestionId = a.QuestionId, UserId = a.UserId })
            .ToListAsync();
        return rows.Select(r => (r.QuestionId.ToString(), r.UserId.ToString())).ToHashSet();
    }

    public async Task<List<AnswerDraft>> ReadAnswerDrafts(Guid questionId)
    {
        var rows = await db.Answers.AsNoTracking()
            .Where(a => a.MatchId == matchId && a.QuestionId == questionId)
            .Select(a => new { a.UserId, a.Drafts, a.AnsweredMs, a.Judged })
            .ToListAsync();

        return rows.Select(r =>
        {
            Verdict? suggestion = null;
            if (r.Drafts is { } draftsEl && draftsEl.ValueKind == JsonValueKind.Object
                && draftsEl.TryGetProperty("auto", out var auto)
                && auto.ValueKind == JsonValueKind.String
                && Enum.TryParse<Verdict>(auto.GetString(), out var parsed))
                suggestion = parsed;
            return new AnswerDraft(r.UserId.ToString(), suggestion, r.AnsweredMs, r.Judged);
        }).ToList();
    }
}

/// <summary>Readers + session helpers (port of live/store.ts exports).</summary>
public sealed class LiveReader(AOCDbContext db)
{
    public sealed record LiveSnapshot(
        int Version,
        string RoundId,
        JsonElement State,
        Dictionary<string, JsonElement> Archive);

    public async Task<LiveSnapshot?> ReadLiveAsync(Guid matchId)
    {
        var row = await db.MatchLive.AsNoTracking()
            .Where(l => l.MatchId == matchId)
            .Select(l => new { l.Version, l.RoundId, l.State, l.Archive })
            .FirstOrDefaultAsync();
        if (row is null) return null;

        var archive = row.Archive.ValueKind == JsonValueKind.Object
            ? row.Archive.Deserialize<Dictionary<string, JsonElement>>(JsonApi.Options) ?? []
            : [];
        return new LiveSnapshot(row.Version, row.RoundId, row.State, archive);
    }

    public async Task<Dictionary<string, int>> SumPointsByPlayerAsync(Guid matchId)
    {
        var rows = await db.Answers.AsNoTracking()
            .Where(a => a.MatchId == matchId)
            .Select(a => new { a.UserId, a.PointsAwarded })
            .ToListAsync();
        var sums = new Dictionary<string, int>();
        foreach (var row in rows)
            sums[row.UserId.ToString()] = sums.GetValueOrDefault(row.UserId.ToString()) + (row.PointsAwarded ?? 0);
        return sums;
    }

    public async Task<Dictionary<string, int>> SumAdjustmentsByPlayerAsync(Guid matchId)
    {
        var rows = await db.ScoreAdjustments.AsNoTracking()
            .Where(a => a.MatchId == matchId)
            .Select(a => new { a.UserId, a.Delta })
            .ToListAsync();
        var sums = new Dictionary<string, int>();
        foreach (var row in rows)
            sums[row.UserId.ToString()] = sums.GetValueOrDefault(row.UserId.ToString()) + row.Delta;
        return sums;
    }

    public async Task<bool> IsSessionActiveAsync(Guid userId, int tokenVersion)
    {
        var row = await db.Users.AsNoTracking()
            .Where(u => u.Id == userId)
            .Select(u => new { u.DisabledAt, u.TokenVersion })
            .FirstOrDefaultAsync();
        return row is not null && row.DisabledAt is null && row.TokenVersion == tokenVersion;
    }

    public async Task<List<SubmittedAnswer>> ReadPlayerAnswersAsync(Guid matchId, Guid userId)
    {
        var rows = await db.Answers.AsNoTracking()
            .Where(a => a.MatchId == matchId && a.UserId == userId)
            .Select(a => new { QuestionId = a.QuestionId, a.Judged, a.Verdict })
            .ToListAsync();
        return rows.Select(r => new SubmittedAnswer(
            r.QuestionId.ToString(), r.Judged, r.Verdict)).ToList();
    }

    public sealed record SubmittedAnswer(string QuestionId, bool Judged, Verdict? Verdict);

    public async Task<List<object>> ReadQuestionAnswersAsync(Guid matchId, Guid questionId)
    {
        var rows = await db.Answers.AsNoTracking()
            .Where(a => a.MatchId == matchId && a.QuestionId == questionId)
            .Select(a => new
            {
                UserId = a.UserId,
                a.Value,
                a.Drafts,
                a.Verdict,
                a.Judged,
                a.PointsAwarded,
                a.SubmittedAt
            })
            .ToListAsync();

        return rows.Select(r => (object)new
        {
            userId = r.UserId,
            value = r.Value,
            drafts = r.Drafts,
            verdict = r.Verdict,
            judged = r.Judged,
            pointsAwarded = r.PointsAwarded,
            submittedAt = r.SubmittedAt
        }).ToList();
    }

    public async Task<List<JudgedAnswer>> ReadJudgedAnswersAsync(Guid matchId)
    {
        var rows = await db.Answers.AsNoTracking()
            .Where(a => a.MatchId == matchId && a.Judged)
            .Select(a => new { QuestionId = a.QuestionId, UserId = a.UserId, a.Verdict })
            .ToListAsync();
        return rows.Select(r => new JudgedAnswer(
            r.QuestionId.ToString(), r.UserId.ToString(), r.Verdict)).ToList();
    }

    public sealed record JudgedAnswer(string QuestionId, string UserId, Verdict? Verdict);
}

/// <summary>Port of live/store.ts writeDraft — the player answer draft writer.</summary>
public sealed class DraftWriter(AOCDbContext db)
{
    public const string AutoDrafter = "auto";

    public async Task WriteDraftAsync(
        Guid matchId, Guid questionId, Guid userId,
        JsonElement value, Verdict suggestion,
        string? draftedBy = null, int? answeredMs = null, bool revise = true)
    {
        draftedBy ??= AutoDrafter;
        var existing = await db.Answers.FirstOrDefaultAsync(a =>
            a.MatchId == matchId && a.QuestionId == questionId && a.UserId == userId);

        if (existing is { Judged: true })
            throw new RuleError("ALREADY_JUDGED", "this answer already has a final verdict");

        var drafts = existing?.Drafts is { } d && d.ValueKind == JsonValueKind.Object
            ? d.Deserialize<Dictionary<string, Verdict>>(JsonApi.Options) ?? []
            : new Dictionary<string, Verdict>();
        drafts[draftedBy] = suggestion;

        if (existing is not null)
        {
            if (!revise)
                throw new RuleError("ALREADY_ANSWERED", "this question already has an answer");
            existing.Value = value;
            existing.Drafts = JsonSerializer.SerializeToElement(drafts, JsonApi.Options);
            if (answeredMs is not null) existing.AnsweredMs = answeredMs;
        }
        else
        {
            db.Answers.Add(new AnswerEntity
            {
                MatchId = matchId,
                QuestionId = questionId,
                UserId = userId,
                Value = value,
                Drafts = JsonSerializer.SerializeToElement(drafts, JsonApi.Options),
                Judged = false,
                FirstAnsweredMs = answeredMs,
                AnsweredMs = answeredMs
            });
        }

        await db.SaveChangesAsync();
    }
}
