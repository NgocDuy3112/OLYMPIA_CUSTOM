using System.Text.Json;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using AOC.Api.Http;
using AOC.Api.Modules.Questions;
using AOC.Domain.Contracts;
using AOC.Infrastructure.Data;
using AOC.Infrastructure.Data.Entities;

namespace AOC.Api.Modules.Matches;

/// <summary>Port of matches/assemble-patch.ts — revision-checked assembly replacement.</summary>
public sealed class AssemblePatchService(AOCDbContext db)
{
    private sealed record RawSourceRow(Guid Id, string Kind, Guid? KeywordId, JsonElement Full);

    private static async Task AssertBucketsAsync(AOCDbContext db, IReadOnlyList<AssemblyEntry> entries)
    {
        var sourceIds = entries.Select(e => e.SourceId).Distinct().ToList();
        if (sourceIds.Count == 0) return;

        var ids = sourceIds.Select(Guid.Parse).ToList();
        var rows = await db.QuestionBank.AsNoTracking()
            .Where(q => ids.Contains(q.Id))
            .Select(q => new { q.Id, q.Kind, q.KeywordId, Full = q.Payload, q.Tags })
            .ToListAsync();

        var byId = rows.ToDictionary(r => r.Id);

        for (var index = 0; index < entries.Count; index++)
        {
            var entry = entries[index];
            if (!byId.TryGetValue(Guid.Parse(entry.SourceId), out var source)) continue;

            string declared;
            if (source.Full.ValueKind == JsonValueKind.Object
                && source.Full.TryGetProperty("type", out var t)
                && t.ValueKind == JsonValueKind.String)
            {
                declared = t.GetString()!;
            }
            else
            {
                declared = source.Kind.ToString();
            }

            var conflict = Buckets.SlotConflict(
                new Buckets.Slot(entry.RoundId, entry.TurnId, entry.Points),
                new Buckets.SlotConflictSource(
                    source.Tags,
                    declared == "HINT" ? "TEXT" : declared,
                    source.KeywordId?.ToString()));
            if (conflict is not null)
                throw new MatchError(MatchErrorCode.VALIDATION, $"questions[{index}]: {conflict}");
        }
    }

    private static (int Added, int Removed) DiffCounts(IReadOnlyList<string> oldIds, IReadOnlyList<string> newIds)
    {
        var remaining = new Dictionary<string, int>();
        foreach (var id in oldIds)
            remaining[id] = remaining.GetValueOrDefault(id) + 1;

        var added = 0;
        foreach (var id in newIds)
        {
            var left = remaining.GetValueOrDefault(id);
            if (left > 0) remaining[id] = left - 1;
            else added += 1;
        }
        var removed = remaining.Values.Sum();
        return (added, removed);
    }

    public async Task<(int AssemblyRevision, int Added, int Removed)> PatchAssembleAsync(
        string tournamentId, string matchId, MatchSchemas.PatchAssembleInput input, Guid actorId)
    {
        var mid = Guid.Parse(matchId);
        var tid = Guid.Parse(tournamentId);

        var existing = await db.Matches.AsNoTracking()
                           .FirstOrDefaultAsync(m => m.Id == mid && m.TournamentId == tid && m.DeletedAt == null)
                       ?? throw new MatchError(MatchErrorCode.NOT_FOUND, $"match {matchId} not found");
        if (existing.Status != MatchStatus.UPCOMING)
            throw new MatchError(MatchErrorCode.IMMUTABLE,
                $"match {matchId} is {existing.Status} and can no longer be assembled");

        var entries = input.Questions;
        await AssertBucketsAsync(db, entries);

        var tournament = await db.Tournaments.AsNoTracking()
                               .FirstAsync(t => t.Id == tid && t.DeletedAt == null);
        var assembly = new MatchAssembly(db);
        var copies = await assembly.BuildQuestionCopiesAsync(
            tournament, existing.RoundConfigsMap, entries);

        var oldIds = existing.QuestionsList
            .Where(q => !string.IsNullOrEmpty(q.SourceId))
            .Select(q => q.SourceId)
            .ToList();
        var counts = DiffCounts(oldIds, entries.Select(e => e.SourceId).ToList());

        // Optimistic assembly revision: UPDATE ... WHERE assembly_revision = @base RETURNING.
        await using var connection = await RawSql.OpenAsync(db);
        await using var update = connection.CreateCommand();
        update.CommandText = """
            UPDATE matches
               SET questions = @questions::jsonb,
                   assembly_revision = assembly_revision + 1,
                   assembled_at = now(),
                   updated_at = now()
             WHERE id = @id
               AND tournament_id = @tournamentId
               AND deleted_at IS NULL
               AND status = 'UPCOMING'
               AND assembly_revision = @baseRevision
             RETURNING assembly_revision
            """;
        AddParam(update, "questions", JsonSerializer.Serialize(copies, JsonDefaults.Options));
        AddParam(update, "id", mid);
        AddParam(update, "tournamentId", tid);
        AddParam(update, "baseRevision", input.BaseRevision);

        var revisionObj = await update.ExecuteScalarAsync();
        if (revisionObj is null || revisionObj is DBNull)
        {
            // Probe for the reason (not found / immutable / stale revision).
            await using var probe = connection.CreateCommand();
            probe.CommandText = """
                SELECT status::text, assembly_revision
                  FROM matches
                 WHERE id = @id AND tournament_id = @tournamentId AND deleted_at IS NULL
                """;
            AddParam(probe, "id", mid);
            AddParam(probe, "tournamentId", tid);

            string? statusText = null;
            int currentRevision = 0;
            var found = false;
            await using (var reader = await probe.ExecuteReaderAsync())
            {
                if (await reader.ReadAsync())
                {
                    found = true;
                    statusText = reader.GetString(0);
                    currentRevision = reader.GetInt32(1);
                }
            }
            if (!found)
                throw new MatchError(MatchErrorCode.NOT_FOUND, $"match {matchId} not found");
            if (statusText != "UPCOMING")
                throw new MatchError(MatchErrorCode.IMMUTABLE,
                    $"match {matchId} is {statusText} and can no longer be assembled");
            throw new StaleRevisionError(currentRevision, input.BaseRevision);
        }

        var revision = Convert.ToInt32(revisionObj);

        db.MatchAssemblyEvents.Add(new MatchAssemblyEventEntity
        {
            MatchId = mid,
            Revision = revision,
            ActorId = actorId,
            Mode = "replace",
            AddedCount = counts.Added,
            RemovedCount = counts.Removed,
            SourceIds = entries.Select(e => e.SourceId).ToArray(),
            At = DateTime.UtcNow
        });
        await db.SaveChangesAsync();

        return (revision, counts.Added, counts.Removed);
    }

    private static void AddParam(System.Data.Common.DbCommand command, string name, object value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.Value = value;
        command.Parameters.Add(parameter);
    }
}

/// <summary>Port of assemble-patch routes.</summary>
public static class AssemblePatchRoutes
{
    public static IEndpointRouteBuilder MapAssemblePatchRoutes(this IEndpointRouteBuilder app)
        => app; // PATCH .../assemble lives in MatchRoutes (same path, same handler)
}
