using Microsoft.EntityFrameworkCore;
using AOC.Domain.Contracts;
using AOC.Domain.Tournament;
using AOC.Infrastructure.Data;

namespace AOC.Api.Modules.Standings;

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

        var drawn = new Dictionary<string, PlayerGroup>();
        foreach (var row in roster)
            if (row.Group is { } g)
                drawn[row.UserId] = g;

        var standings = GroupStage.Build(drawn, await GroupMatchesAsync(id));
        string LineOf(string userId) => names.GetValueOrDefault(userId, "Unknown");

        var groups = new List<GroupBlock>();
        foreach (var groupId in new[] { PlayerGroup.A, PlayerGroup.B })
        {
            var block = standings.ByGroup[groupId];
            groups.Add(new GroupBlock(
                groupId.ToString(),
                block.GroupPoints,
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
