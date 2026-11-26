using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using AOC.Infrastructure.Data;

namespace AOC.Api.Modules.Questions.Reads;

public sealed class QuestionUsageStore(AOCDbContext db)
{
    public async Task<List<QuestionUsage>> QuestionUsageAsync(string questionId)
    {
        var needle = JsonSerializer.Serialize(new[] { new { sourceId = questionId } });
        return await db.Database
            .SqlQueryRaw<QuestionUsage>(
                """
                SELECT id, tournament_id, label, stage_id, status::text
                  FROM matches
                 WHERE deleted_at IS NULL
                   AND questions @> {0}::jsonb
                 ORDER BY updated_at DESC
                 LIMIT 20
                """,
                needle)
            .ToListAsync();
    }
}
