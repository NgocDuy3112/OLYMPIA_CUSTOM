using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace AOC.Infrastructure.Data;

public static class RawSql
{
    public static async Task<NpgsqlConnection> OpenAsync(AOCDbContext db)
    {
        var connectionString = AOCNpgsql.ConfiguredConnectionString
            ?? db.Database.GetConnectionString()
            ?? throw new InvalidOperationException("no connection string configured");
        var connection = new NpgsqlConnection(connectionString);
        await connection.OpenAsync();
        return connection;
    }
}
