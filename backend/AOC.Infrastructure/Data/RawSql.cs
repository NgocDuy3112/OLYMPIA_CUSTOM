using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace AOC.Infrastructure.Data;

/// <summary>
/// Ad-hoc SQL gets its OWN pooled connection instead of the DbContext's shared
/// one. The context connection may already be open (any earlier EF query in the
/// same request opened it) — opening it again throws "Connection already open",
/// and closing it behind EF's back would break the next operation.
/// Disposing the returned connection returns it to the Npgsql pool.
/// </summary>
public static class RawSql
{
    public static async Task<NpgsqlConnection> OpenAsync(AOCDbContext db)
    {
        // NOT db.Database.GetConnectionString(): it is redacted (password
        // stripped) as soon as the context's shared connection has been opened —
        // which every request's auth guard already did.
        var connectionString = AOCNpgsql.ConfiguredConnectionString
            ?? db.Database.GetConnectionString()
            ?? throw new InvalidOperationException("no connection string configured");
        var connection = new NpgsqlConnection(connectionString);
        await connection.OpenAsync();
        return connection;
    }
}
