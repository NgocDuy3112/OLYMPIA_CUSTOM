using Microsoft.EntityFrameworkCore;
using AOC.Domain.Contracts;
using AOC.Domain.Tournament;
using StandingsBuilder = AOC.Domain.Tournament.Standings;
using AOC.Infrastructure.Data;
using AOC.Infrastructure.Data.Entities;

namespace AOC.Api.Modules.Standings;

public sealed class StandingsService(AOCDbContext db)
{
    public async Task<List<StandingsBuilder.MatchResultInput>> TournamentMatchesAsync(Guid tournamentId)
    {
        var rows = await (
            from m in db.Matches.AsNoTracking()
            join r in db.MatchResults.AsNoTracking() on m.Id equals r.MatchId
            where m.TournamentId == tournamentId && m.Kind == MatchKind.STANDARD && m.DeletedAt == null
            orderby m.ScheduledAt, m.Slot
            select new { m.Id, m.StageId, m.Slot, r.Results }
        ).ToListAsync();

        return rows.Select(row => new StandingsBuilder.MatchResultInput(
            row.Id.ToString(),
            row.StageId,
            row.Slot,
            JsonDefaults.Deserialize<List<ResultEntry>>(row.Results)?
                .Where(e => e.Kind == "user" && !string.IsNullOrEmpty(e.UserId))
                .Select(e => new StandingsBuilder.ResultRow(e.UserId, e.TotalScore, e.Rank))
                .ToList() ?? []
        )).ToList();
    }

    private async Task<List<StandingsBuilder.StageRef>> TournamentStagesAsync(Guid tournamentId)
    {
        var row = await db.Tournaments.AsNoTracking()
            .FirstOrDefaultAsync(t => t.Id == tournamentId && t.DeletedAt == null);
        if (row is null) return [];
        return row.StagesList.Select(s => new StandingsBuilder.StageRef(s.Id, s.Title)).ToList();
    }

    private async Task<List<StandingsBuilder.PlayerInput>> TournamentRosterAsync(Guid tournamentId)
    {
        return await (
            from tp in db.TournamentPlayers.AsNoTracking()
            join u in db.Users.AsNoTracking() on tp.UserId equals u.Id
            where tp.TournamentId == tournamentId
            select new { tp.UserId, u.DisplayName }
        ).Select(x => new StandingsBuilder.PlayerInput(x.UserId.ToString(), x.DisplayName))
         .ToListAsync();
    }

    public async Task<List<StandingsBuilder.PlayerStanding>> GetStandingsAsync(string tournamentId)
    {
        var id = Guid.Parse(tournamentId);
        var exists = await db.Tournaments.AsNoTracking()
            .AnyAsync(t => t.Id == id && t.DeletedAt == null);
        if (!exists) return [];

        return StandingsBuilder.Build(new StandingsBuilder.BuildStandingsInput(
            await TournamentStagesAsync(id),
            await TournamentMatchesAsync(id),
            await TournamentRosterAsync(id)));
    }

    public async Task<List<StandingsBuilder.PlayerStanding>> RecomputeStandingsAsync(string tournamentId)
    {
        var id = Guid.Parse(tournamentId);
        var rows = await GetStandingsAsync(tournamentId);
        var placed = rows.Where(r => r.Place is not null).ToList();

        var real = await KnownUsersAsync(placed.Select(r => r.UserId).ToList());
        var storable = placed.Where(r => real.Contains(r.UserId)).ToList();

        var existing = await db.TournamentStandings
            .Where(s => s.TournamentId == id)
            .ToListAsync();
        db.TournamentStandings.RemoveRange(existing);
        foreach (var row in storable)
        {
            db.TournamentStandings.Add(new TournamentStandingEntity
            {
                TournamentId = id,
                UserId = Guid.Parse(row.UserId),
                Rank = row.Place!.Value
            });
        }
        await db.SaveChangesAsync();

        return rows;
    }

    private async Task<HashSet<string>> KnownUsersAsync(List<string> userIds)
    {
        if (userIds.Count == 0) return [];
        var guids = userIds.Select(Guid.Parse).ToList();
        var rows = await db.Users.AsNoTracking()
            .Where(u => guids.Contains(u.Id))
            .Select(u => u.Id)
            .ToListAsync();
        return rows.Select(g => g.ToString()).ToHashSet();
    }

    public async Task<Dictionary<string, string>> NamesOfAsync(IEnumerable<string> userIds)
    {
        var list = userIds.ToList();
        if (list.Count == 0) return new Dictionary<string, string>();
        var guids = list.Select(Guid.Parse).ToList();
        var rows = await db.Users.AsNoTracking()
            .Where(u => guids.Contains(u.Id))
            .Select(u => new { u.Id, u.DisplayName })
            .ToListAsync();
        return rows.ToDictionary(r => r.Id.ToString(), r => r.DisplayName);
    }
}
