using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Npgsql;

namespace AOC.Infrastructure.Data;

/// <summary>
/// Port of drizzle-kit migrate — applies backend/migrations/*.sql in journal
/// order, tracked in drizzle.__drizzle_migrations exactly like drizzle-orm's
/// migrator (same table, same created_at=folderMillis decision).
/// </summary>
public static class MigrationRunner
{
    private sealed record JournalEntry(int Idx, string Tag, long When, bool Breakpoints);

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
            .Select(e => new JournalEntry(
                e.GetProperty("idx").GetInt32(),
                e.GetProperty("tag").GetString()!,
                e.GetProperty("when").GetInt64(),
                e.GetProperty("breakpoints").GetBoolean()))
            .OrderBy(e => e.Idx)
            .ToList();

        await using var connection = new NpgsqlConnection(connectionString);
        await connection.OpenAsync();

        await Exec(connection, "CREATE SCHEMA IF NOT EXISTS \"drizzle\"");
        await Exec(connection, """
            CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
                id SERIAL PRIMARY KEY,
                hash text NOT NULL,
                created_at bigint
            )
            """);

        long? lastCreatedAt = null;
        await using (var last = connection.CreateCommand())
        {
            last.CommandText =
                """select created_at from "drizzle"."__drizzle_migrations" order by created_at desc limit 1""";
            var scalar = await last.ExecuteScalarAsync();
            if (scalar is not null and not DBNull) lastCreatedAt = Convert.ToInt64(scalar);
        }

        var pending = entries
            .Where(e => lastCreatedAt is null || lastCreatedAt.Value < e.When)
            .ToList();
        if (pending.Count == 0) return;

        await using var transaction = await connection.BeginTransactionAsync();
        try
        {
            foreach (var entry in pending)
            {
                var path = Path.Combine(folder, $"{entry.Tag}.sql");
                if (!File.Exists(path))
                    throw new InvalidOperationException($"No file {path} found in {folder} folder");
                var query = await File.ReadAllTextAsync(path);
                var statements = query.Split("--> statement-breakpoint");

                foreach (var raw in statements)
                {
                    var statement = raw.Trim();
                    if (statement.Length == 0) continue;
                    await Exec(connection, statement, transaction);
                }

                var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(query)))
                    .ToLowerInvariant();
                await using var insert = connection.CreateCommand();
                insert.Transaction = transaction;
                insert.CommandText =
                    """insert into "drizzle"."__drizzle_migrations" ("hash", "created_at") values (@hash, @created)""";
                insert.Parameters.AddWithValue("hash", hash);
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

    private static async Task Exec(NpgsqlConnection connection, string sql,
        NpgsqlTransaction? transaction = null)
    {
        await using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = sql;
        await command.ExecuteNonQueryAsync();
    }
}
