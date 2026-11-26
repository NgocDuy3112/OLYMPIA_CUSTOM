using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using AOC.Domain.Contracts;
using AOC.Infrastructure.Data;
using AOC.Infrastructure.Data.Entities;

namespace AOC.Api.Modules.Live;

public sealed class DraftAuditStore(AOCDbContext db, ILogger<DraftAuditStore> logger)
{
    public const string Action = "answer_drafted";

    public async Task RecordReviseAsync(
        Guid matchId, string roundId, Guid questionId, Guid userId, Verdict suggestion,
        string? ip, string? userAgent)
    {
        try
        {
            var bumped = await db.Database.SqlQueryRaw<int>(
                """
                UPDATE audit_events
                   SET details = jsonb_set(coalesce(details, '{{}}'::jsonb), '{{attempts}}',
                                   to_jsonb(coalesce((details->>'attempts')::int, 0) + 1))
                              || jsonb_build_object('suggestion', {4}::text)
                 WHERE id = (
                     SELECT id FROM audit_events
                      WHERE action = {3}
                        AND match_id = {0}::uuid
                        AND details->>'questionId' = {1}::text
                        AND details->>'userId' = {2}::text
                      ORDER BY created_at DESC
                      LIMIT 1)
                RETURNING 1 AS "Value"
                """,
                matchId, questionId.ToString(), userId.ToString(), Action,
                suggestion.ToString()).ToListAsync();
            if (bumped.Count > 0) return;

            db.AuditEvents.Add(new AuditEventEntity
            {
                Action = Action,
                MatchId = matchId,
                Details = JsonSerializer.SerializeToElement(new
                {
                    roundId,
                    questionId,
                    userId,
                    suggestion = suggestion.ToString(),
                    attempts = 1
                }),
                Ip = ip,
                UserAgent = userAgent
            });
            await db.SaveChangesAsync();
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "draft audit write failed for match {MatchId}", matchId);
        }
    }
}
