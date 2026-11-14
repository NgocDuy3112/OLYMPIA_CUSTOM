using Microsoft.EntityFrameworkCore;
using AOC.Api.Http;
using AOC.Domain.Contracts;
using AOC.Domain.Engine.Scoring;
using StandingsBuilder = AOC.Domain.Engine.Scoring.Standings;
using AOC.Infrastructure.Data;
using AOC.Infrastructure.Data.Entities;

namespace AOC.Api.Modules.Standings;

/// <summary>Port of standings/service.ts.</summary>
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

/// <summary>Port of standings/groups.ts — group tables for the console.</summary>
public sealed class GroupTablesService(AOCDbContext db)
{
    private async Task<List<(string UserId, string DisplayName, PlayerGroup? Group)>> RosterWithGroupsAsync(Guid tournamentId)
    {
        var rows = await (
            from tp in db.TournamentPlayers.AsNoTracking()
            join u in db.Users.AsNoTracking() on tp.UserId equals u.Id
            where tp.TournamentId == tournamentId
            orderby tp.EnrolledAt
            select new { UserId = tp.UserId, Group = tp.Group, u.DisplayName }
        ).ToListAsync();

        return rows.Select(x => (x.UserId.ToString(), x.DisplayName, x.Group)).ToList();
    }

    private async Task<List<GroupStage.GroupMatchInput>> GroupMatchesAsync(Guid tournamentId)
    {
        var stageIds = new[] { "phase-1", "phase-2" };
        var rows = await (
            from m in db.Matches.AsNoTracking()
            join r in db.MatchResults.AsNoTracking() on m.Id equals r.MatchId
            where m.TournamentId == tournamentId && m.Kind == MatchKind.STANDARD
                  && stageIds.Contains(m.StageId) && m.DeletedAt == null
            orderby m.ScheduledAt, m.Slot
            select new { m.StageId, r.Results }
        ).ToListAsync();

        var inputs = new List<GroupStage.GroupMatchInput>();
        foreach (var row in rows)
        {
            var phase = GroupStage.PhaseOfStage(row.StageId);
            if (phase is null) continue;
            var results = (JsonDefaults.Deserialize<List<ResultEntry>>(row.Results) ?? [])
                .Where(e => e.Kind == "user")
                .Select(e => new GroupStage.GroupMatchResult(e.UserId, e.Rank, e.TotalScore))
                .ToList();
            if (results.Count > 0)
                inputs.Add(new GroupStage.GroupMatchInput(phase.Value, results));
        }
        return inputs;
    }

    public async Task<GroupTables> GetGroupTablesAsync(string tournamentId)
    {
        var id = Guid.Parse(tournamentId);
        var exists = await db.Tournaments.AsNoTracking()
            .AnyAsync(t => t.Id == id && t.DeletedAt == null);
        if (!exists) return new GroupTables([], [], []);

        var roster = await RosterWithGroupsAsync(id);
        var names = roster.ToDictionary(r => r.UserId, r => r.DisplayName);

        var drawn = new Dictionary<string, GroupStage.GroupLabel>();
        foreach (var row in roster)
            if (row.Group is { } g)
                drawn[row.UserId] = g == PlayerGroup.A ? GroupStage.GroupLabel.A : GroupStage.GroupLabel.B;

        var standings = GroupStage.Build(drawn, await GroupMatchesAsync(id));
        string LineOf(string userId) => names.GetValueOrDefault(userId, "Unknown");

        var groups = new List<GroupBlock>();
        foreach (var groupId in new[] { GroupStage.GroupLabel.A, GroupStage.GroupLabel.B })
        {
            var block = standings.ByGroup[groupId];
            groups.Add(new GroupBlock(
                groupId == GroupStage.GroupLabel.A ? "A" : "B",
                block.TeamPoints,
                block.Contestants.Select(line => new GroupRow(
                    line.UserId,
                    LineOf(line.UserId),
                    line.MatchesPlayed,
                    line.BankedPoints,
                    line.Averages)).ToList()));
        }

        var unassigned = roster
            .Where(r => r.Group is null)
            .Select(r => new UnassignedRow(r.UserId, r.DisplayName))
            .ToList();

        var wildcard = standings.Wildcard.Select(w => new WildcardRow(
            w.Line.UserId,
            LineOf(w.Line.UserId),
            w.Line.MatchesPlayed,
            w.Line.BankedPoints,
            w.Line.Averages,
            w.Avg)).ToList();

        return new GroupTables(groups, unassigned, wildcard);
    }
}

public sealed record GroupRow(
    string UserId, string DisplayName, int MatchesPlayed, int BankedPoints,
    GroupStage.Averages Averages);

public sealed record GroupBlock(string Id, int TeamPoints, List<GroupRow> Rows);

public sealed record UnassignedRow(string UserId, string DisplayName);

public sealed record WildcardRow(
    string UserId, string DisplayName, int MatchesPlayed, int BankedPoints,
    GroupStage.Averages Averages, double Avg);

public sealed record GroupTables(
    List<GroupBlock> Groups, List<UnassignedRow> Unassigned, List<WildcardRow> Wildcard);
