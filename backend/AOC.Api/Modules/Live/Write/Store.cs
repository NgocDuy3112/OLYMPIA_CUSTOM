using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using AOC.Api.Http;
using AOC.Domain.Contracts;
using AOC.Domain.Gameplay;
using AOC.Domain.Gameplay.Turns;
using AOC.Infrastructure.Data;
using AOC.Infrastructure.Data.Entities;

namespace AOC.Api.Modules.Live;

public sealed class PgLiveStore(AOCDbContext db, Guid matchId) : ILiveStore<JsonElement>
{
    public async Task<T> Transact<T>(Func<ILiveTx<JsonElement>, Task<T>> fn)
    {
        await using var transaction = await db.Database.BeginTransactionAsync();

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
        await db.SaveChangesAsync();
    }

    public async Task RecordFacts(List<LiveFact> facts)
    {
        var drafts = facts.OfType<DraftFact>().ToList();
        if (drafts.Count > 0)
        {
            var existingByKey = await ExistingAnswersAsync(
                drafts.Select(d => (d.QuestionId, d.UserId)).ToList());
            foreach (var draft in drafts)
            {
                if (existingByKey.ContainsKey((draft.QuestionId, draft.UserId))) continue;
                db.Answers.Add(new AnswerEntity
                {
                    MatchId = matchId,
                    QuestionId = Guid.Parse(draft.QuestionId),
                    UserId = Guid.Parse(draft.UserId),
                    Value = draft.Value,
                    Drafts = JsonSerializer.SerializeToElement(
                        new Dictionary<string, Verdict> { ["auto"] = draft.Suggestion }, JsonApi.Options)
                });
            }
        }

        var answers = facts.OfType<AnswerFact>().ToList();
        if (answers.Count > 0)
        {
            // A verdict is final once written: re-recording the same answer only
            // refreshes the value, never wipes the score it already earned.
            var existingByKey = await ExistingAnswersAsync(
                answers.Select(a => (a.QuestionId, a.UserId)).ToList());
            foreach (var answer in answers)
            {
                if (existingByKey.TryGetValue((answer.QuestionId, answer.UserId), out var row))
                {
                    row.Value = answer.Value;
                    row.Verdict = answer.Verdict;
                    row.PointsAwarded = answer.PointsAwarded;
                    continue;
                }
                db.Answers.Add(new AnswerEntity
                {
                    MatchId = matchId,
                    QuestionId = Guid.Parse(answer.QuestionId),
                    UserId = Guid.Parse(answer.UserId),
                    Value = answer.Value,
                    AutoMatched = answer.AutoMatched,
                    Verdict = answer.Verdict,
                    PointsAwarded = answer.PointsAwarded
                });
            }
        }

        foreach (var judge in facts.OfType<JudgeFact>())
        {
            var target = await db.Answers.FirstOrDefaultAsync(a =>
                a.MatchId == matchId
                && a.QuestionId == Guid.Parse(judge.QuestionId)
                && a.UserId == Guid.Parse(judge.UserId));
            if (target is null)
            {
                // Nobody answered: still record the verdict and its deduction.
                db.Answers.Add(new AnswerEntity
                {
                    MatchId = matchId,
                    QuestionId = Guid.Parse(judge.QuestionId),
                    UserId = Guid.Parse(judge.UserId),
                    Value = JsonSerializer.SerializeToElement(new { oral = true }, JsonApi.Options),
                    Verdict = judge.Verdict,
                    PointsAwarded = judge.PointsAwarded
                });
                continue;
            }
            target.Verdict = judge.Verdict;
            target.PointsAwarded = judge.PointsAwarded;
        }

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
                    .Select(e => new { e.QuestionId, e.Payload })
                    .ToListAsync();
                var wanted = evt.Payload.TryGetProperty("power", out var pw) ? pw.GetString() : null;
                duplicate = MatchEventAudit.PowerLogged(
                    powers.Select(p => (p.QuestionId, p.Payload)), questionId, wanted);
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

        foreach (var regrade in facts.OfType<RegradeFact>())
        {
            var target = await db.Answers.FirstOrDefaultAsync(a =>
                a.MatchId == matchId
                && a.QuestionId == Guid.Parse(regrade.QuestionId)
                && a.UserId == Guid.Parse(regrade.UserId));
            if (target is null)
                throw new RuleError("NO_ANSWER",
                    $"no submitted answer from {regrade.UserId} to regrade");
            target.PointsAwarded = regrade.PointsAwarded;
        }

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

    private async Task<Dictionary<(string QuestionId, string UserId), AnswerEntity>> ExistingAnswersAsync(
        List<(string QuestionId, string UserId)> keys)
    {
        var questionIds = keys.Select(k => Guid.Parse(k.QuestionId)).Distinct().ToList();
        var userIds = keys.Select(k => Guid.Parse(k.UserId)).Distinct().ToList();
        var rows = await db.Answers
            .Where(a => a.MatchId == matchId
                && questionIds.Contains(a.QuestionId)
                && userIds.Contains(a.UserId))
            .ToListAsync();
        return rows.ToDictionary(r => (r.QuestionId.ToString(), r.UserId.ToString()));
    }

    public async Task<List<AnswerDraft>> ReadAnswerDrafts(Guid questionId)
    {
        var rows = await db.Answers.AsNoTracking()
            .Where(a => a.MatchId == matchId && a.QuestionId == questionId)
            .Select(a => new { a.UserId, a.Drafts, a.AnsweredMs, a.Verdict })
            .ToListAsync();

        return rows.Select(r =>
        {
            Verdict? suggestion = null;
            if (r.Drafts is { } draftsEl && draftsEl.ValueKind == JsonValueKind.Object
                && draftsEl.TryGetProperty("auto", out var auto)
                && auto.ValueKind == JsonValueKind.String
                && Enum.TryParse<Verdict>(auto.GetString(), out var parsed))
                suggestion = parsed;
            return new AnswerDraft(r.UserId.ToString(), suggestion, r.AnsweredMs, r.Verdict);
        }).ToList();
    }
}

public sealed class LiveReader(AOCDbContext db)
{
    public sealed record LiveSnapshot(
        int Version,
        string RoundId,
        JsonElement State,
        Dictionary<string, JsonElement> Archive,
        TieBreakState? TieBreak);

    public async Task<LiveSnapshot?> ReadLiveAsync(Guid matchId)
    {
        var row = await db.MatchLive.AsNoTracking()
            .Where(l => l.MatchId == matchId)
            .Select(l => new { l.Version, l.RoundId, l.State, l.Archive, l.Tiebreak })
            .FirstOrDefaultAsync();
        if (row is null) return null;

        var archive = row.Archive.ValueKind == JsonValueKind.Object
            ? row.Archive.Deserialize<Dictionary<string, JsonElement>>(JsonApi.Options) ?? []
            : [];
        var tieBreak = row.Tiebreak is { } raw
            ? raw.Deserialize<TieBreakState>(JsonApi.Options)
            : null;
        return new LiveSnapshot(row.Version, row.RoundId, row.State, archive, tieBreak);
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
            .Select(a => new { QuestionId = a.QuestionId, a.Verdict, a.AnsweredMs, a.Drafts, a.Value })
            .ToListAsync();
        return rows.Select(r =>
        {
            Verdict? suggestion = null;
            if (r.Drafts is { } drafts && drafts.ValueKind == JsonValueKind.Object
                && drafts.TryGetProperty("auto", out var auto)
                && auto.ValueKind == JsonValueKind.String
                && Enum.TryParse<Verdict>(auto.GetString(), out var parsed))
                suggestion = parsed;
            return new SubmittedAnswer(
                r.QuestionId.ToString(), r.Verdict, r.AnsweredMs, suggestion, r.Value);
        }).ToList();
    }

    public sealed record SubmittedAnswer(
        string QuestionId, Verdict? Verdict, int? AnsweredMs,
        Verdict? Suggestion = null, JsonElement Value = default);

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
                a.PointsAwarded,
                a.SubmittedAt,
                a.AnsweredMs
            })
            .ToListAsync();

        return rows.Select(r => (object)new
        {
            questionId = questionId,
            userId = r.UserId,
            value = r.Value,
            drafts = r.Drafts,
            verdict = r.Verdict,
            pointsAwarded = r.PointsAwarded,
            submittedAt = r.SubmittedAt,
            answeredMs = r.AnsweredMs
        }).ToList();
    }

    public async Task<List<RevealedAnswerRow>> ReadRevealedAnswersAsync(Guid matchId, Guid questionId)
    {
        var rows = await db.Answers.AsNoTracking()
            .Where(a => a.MatchId == matchId && a.QuestionId == questionId)
            .ToListAsync();
        return rows
            .Select(a => new RevealedAnswerRow(a.UserId.ToString(), a.ValueObject, a.Verdict, a.AnsweredMs))
            .ToList();
    }

    public async Task<List<JudgedAnswer>> ReadJudgedAnswersAsync(Guid matchId)
    {
        var rows = await db.Answers.AsNoTracking()
            .Where(a => a.MatchId == matchId && a.Verdict != null)
            .Select(a => new { QuestionId = a.QuestionId, UserId = a.UserId, a.Verdict, a.AnsweredMs })
            .ToListAsync();
        return rows.Select(r => new JudgedAnswer(
            r.QuestionId.ToString(), r.UserId.ToString(), r.Verdict, r.AnsweredMs)).ToList();
    }

    public sealed record JudgedAnswer(string QuestionId, string UserId, Verdict? Verdict, int? AnsweredMs);
}

public sealed class DraftWriter(AOCDbContext db)
{
    public const string AutoDrafter = "auto";

    public async Task<bool> WriteDraftAsync(
        Guid matchId, Guid questionId, Guid userId,
        JsonElement value, Verdict suggestion,
        string? draftedBy = null, int? answeredMs = null, bool revise = true)
    {
        draftedBy ??= AutoDrafter;
        var drafts = JsonSerializer.Serialize(
            new Dictionary<string, Verdict> { [draftedBy] = suggestion }, JsonApi.Options);

        var written = revise
            ? await db.Database.SqlQueryRaw<int>(
                """
                INSERT INTO answers (match_id, question_id, user_id, value, drafts, first_answered_ms, answered_ms)
                VALUES ({0}::uuid, {1}::uuid, {2}::uuid, {3}::jsonb, {4}::jsonb, {5}, {6})
                ON CONFLICT (match_id, question_id, user_id) DO UPDATE
                   SET value = EXCLUDED.value,
                       drafts = coalesce(answers.drafts, jsonb_build_object()) || EXCLUDED.drafts,
                       answered_ms = coalesce(EXCLUDED.answered_ms, answers.answered_ms)
                 WHERE answers.verdict IS NULL
                   AND (answers.value IS DISTINCT FROM EXCLUDED.value
                        OR answers.drafts -> {7}::text IS DISTINCT FROM EXCLUDED.drafts -> {7}::text)
                RETURNING 1 AS "Value"
                """,
                matchId, questionId, userId, JsonSerializer.Serialize(value, JsonApi.Options), drafts,
                answeredMs!, answeredMs!, draftedBy).ToListAsync()
            : await db.Database.SqlQueryRaw<int>(
                """
                INSERT INTO answers (match_id, question_id, user_id, value, drafts, first_answered_ms, answered_ms)
                VALUES ({0}::uuid, {1}::uuid, {2}::uuid, {3}::jsonb, {4}::jsonb, {5}, {6})
                ON CONFLICT (match_id, question_id, user_id) DO NOTHING
                RETURNING 1 AS "Value"
                """,
                matchId, questionId, userId, JsonSerializer.Serialize(value, JsonApi.Options), drafts,
                answeredMs!, answeredMs!).ToListAsync();

        if (written.Count > 0) return true;

        var verdict = await db.Answers.AsNoTracking()
            .Where(a => a.MatchId == matchId && a.QuestionId == questionId && a.UserId == userId)
            .Select(a => a.Verdict)
            .FirstOrDefaultAsync();
        if (verdict is not null)
            throw new RuleError("ALREADY_JUDGED", "this answer already has a final verdict");
        if (!revise)
            throw new RuleError("ALREADY_ANSWERED", "this question already has an answer");
        return false;
    }
}
