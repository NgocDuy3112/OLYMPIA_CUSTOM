using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using AOC.Api.Http;
using AOC.Domain.Gameplay.Turns;
using AOC.Infrastructure.Data;
using AOC.Infrastructure.Data.Entities;

namespace AOC.Api.Modules.Live.TieBreak;

public sealed class TieBreakStore(AOCDbContext db, Guid matchId)
{
    public async Task<T> Transact<T>(Func<TieBreakTx, Task<T>> fn)
    {
        await using var transaction = await db.Database.BeginTransactionAsync();

        var row = await db.MatchLive
            .FromSqlInterpolated($"SELECT * FROM match_live WHERE match_id = {matchId} FOR UPDATE")
            .FirstOrDefaultAsync();

        if (row is null) throw new LiveNotFoundError(matchId.ToString());

        var result = await fn(new TieBreakTx(row));
        await db.SaveChangesAsync();
        await transaction.CommitAsync();
        return result;
    }
}

public sealed class TieBreakTx(MatchLiveEntity row)
{
    public int Version => row.Version;

    public TieBreakState? Load()
        => row.Tiebreak is { } raw ? raw.Deserialize<TieBreakState>(JsonApi.Options) : null;

    public void Save(TieBreakState state)
    {
        row.Tiebreak = JsonSerializer.SerializeToElement(state, JsonApi.Options);
        row.Version += 1;
        row.UpdatedAt = DateTime.UtcNow;
    }
}
