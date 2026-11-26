using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Npgsql;

namespace AOC.Infrastructure.Data;

public sealed record MigrationJournalEntry(int Idx, string Tag, long When);

public static class MigrationRunner
{
    private const string AdvisoryLockSql = "select pg_advisory_lock(hashtext('aoc_migrations'))";
    private const string AdvisoryUnlockSql = "select pg_advisory_unlock(hashtext('aoc_migrations'))";

    public static IReadOnlyList<MigrationJournalEntry> PendingEntries(
        IReadOnlyList<MigrationJournalEntry> entries,
        IReadOnlyList<string> appliedHashes,
        IReadOnlyDictionary<string, string> hashesByTag)
    {
        for (var i = 1; i < entries.Count; i++)
            if (entries[i].Idx <= entries[i - 1].Idx)
                throw new InvalidOperationException(
                    $"migration journal is not monotonic: idx {entries[i].Idx} follows {entries[i - 1].Idx}");

        if (appliedHashes.Count > entries.Count)
            throw new InvalidOperationException(
                $"{appliedHashes.Count} migrations are recorded but the journal has only " +
                $"{entries.Count} entries");

        for (var i = 0; i < appliedHashes.Count; i++)
        {
            var entry = entries[i];
            if (!hashesByTag.TryGetValue(entry.Tag, out var fileHash))
                throw new InvalidOperationException(
                    $"applied migration {entry.Idx} ({entry.Tag}) has no file in the journal folder");
            if (!string.Equals(fileHash, appliedHashes[i], StringComparison.Ordinal))
                throw new InvalidOperationException(
                    $"migration {entry.Idx} ({entry.Tag}) changed after it was applied: " +
                    $"recorded hash {appliedHashes[i]}, file hash {fileHash}");
        }

        return entries.Skip(appliedHashes.Count).ToList();
    }

    public static async Task RunAsync(string connectionString, string? migrationsFolder = null)
    {
        var folder = migrationsFolder
            ?? Environment.GetEnvironmentVariable("MIGRATIONS_FOLDER")
            ?? "migrations";

        var journalPath = Path.Combine(folder, "meta", "_journal.json");
        if (!File.Exists(journalPath))
            throw new InvalidOperationException($"Can't find meta/_journal.json file (looked in {folder})");

        using var journalDoc = JsonDocument.Parse(await File.ReadAllTextAsync(journalPath));
        var entries = journalDoc.RootElement.GetProperty("entries").EnumerateArray()
            .Select(e => new MigrationJournalEntry(
                e.GetProperty("idx").GetInt32(),
                e.GetProperty("tag").GetString()!,
                e.GetProperty("when").GetInt64()))
            .OrderBy(e => e.Idx)
            .ToList();

        var queries = new Dictionary<string, string>();
        var hashes = new Dictionary<string, string>();
        foreach (var entry in entries)
        {
            var path = Path.Combine(folder, $"{entry.Tag}.sql");
            if (!File.Exists(path))
                throw new InvalidOperationException($"No file {path} found in {folder} folder");
            var query = await File.ReadAllTextAsync(path);
            queries[entry.Tag] = query;
            hashes[entry.Tag] = Hash(query);
        }

        await using var connection = new NpgsqlConnection(connectionString);
        await connection.OpenAsync();

        await Exec(connection, AdvisoryLockSql);
        try
        {
            await MigrateAsync(connection, entries, queries, hashes);
        }
        finally
        {
            await Exec(connection, AdvisoryUnlockSql);
        }
    }

    private static async Task MigrateAsync(
        NpgsqlConnection connection,
        IReadOnlyList<MigrationJournalEntry> entries,
        IReadOnlyDictionary<string, string> queries,
        IReadOnlyDictionary<string, string> hashes)
    {
        await Exec(connection, "CREATE SCHEMA IF NOT EXISTS \"drizzle\"");
        await Exec(connection, """
            CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
                id SERIAL PRIMARY KEY,
                hash text NOT NULL,
                created_at bigint
            )
            """);

        var appliedHashes = new List<string>();
        await using (var applied = connection.CreateCommand())
        {
            applied.CommandText =
                """select hash from "drizzle"."__drizzle_migrations" order by id""";
            await using var rows = await applied.ExecuteReaderAsync();
            while (await rows.ReadAsync()) appliedHashes.Add(rows.GetString(0));
        }

        var pending = PendingEntries(entries, appliedHashes, hashes);
        if (pending.Count == 0) return;

        await using var transaction = await connection.BeginTransactionAsync();
        try
        {
            foreach (var entry in pending)
            {
                var query = queries[entry.Tag];
                foreach (var raw in query.Split("--> statement-breakpoint"))
                {
                    var statement = raw.Trim();
                    if (statement.Length == 0) continue;
                    await Exec(connection, statement, transaction);
                }

                await using var insert = connection.CreateCommand();
                insert.Transaction = transaction;
                insert.CommandText =
                    """insert into "drizzle"."__drizzle_migrations" ("hash", "created_at") values (@hash, @created)""";
                insert.Parameters.AddWithValue("hash", Hash(query));
                insert.Parameters.AddWithValue("created", entry.When);
                await insert.ExecuteNonQueryAsync();
            }

            await transaction.CommitAsync();
        }
        catch
        {
            await transaction.RollbackAsync();
            throw;
        }
    }

    private static string Hash(string query)
        => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(query))).ToLowerInvariant();

    private static async Task Exec(NpgsqlConnection connection, string sql,
        NpgsqlTransaction? transaction = null)
    {
        await using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = sql;
        await command.ExecuteNonQueryAsync();
    }
}
