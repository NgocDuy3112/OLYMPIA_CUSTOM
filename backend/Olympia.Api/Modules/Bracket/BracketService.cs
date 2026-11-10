using Microsoft.EntityFrameworkCore;
using Olympia.Api.Http;
using Olympia.Domain.Contracts;
using Olympia.Domain.Engine;
using Olympia.Infrastructure.Data;
using Olympia.Infrastructure.Data.Entities;
using Ladder = Olympia.Domain.Engine.Bracket;

namespace Olympia.Api.Modules.Bracket;

public sealed record FormatCheck(bool Checked, List<string> Problems)
{
    public static readonly FormatCheck Unchecked = new(false, []);
}

/// <summary>Port of bracket/service.ts — format checks for match assembly.</summary>
public sealed class BracketService(OlympiaDbContext db)
{
    private sealed record PlayedMatch(Guid Id, int? Slot, string StageId, List<string> Order, Dictionary<string, int> Scores);

    private async Task<List<PlayedMatch>> PlayedMatchesAsync(Guid tournamentId, string stageId)
    {
        var rows = await (
            from m in db.Matches.AsNoTracking()
            join r in db.MatchResults.AsNoTracking() on m.Id equals r.MatchId
            where m.TournamentId == tournamentId && m.StageId == stageId
                  && m.Kind == MatchKind.STANDARD && m.DeletedAt == null
            orderby m.Slot, m.Id
            select new { m.Id, m.Slot, m.StageId, r.Results }
        ).ToListAsync();

        return rows.Select(row =>
        {
            var entries = (JsonDefaults.Deserialize<List<ResultEntry>>(row.Results) ?? [])
                .Where(e => e.Kind == "user" && !string.IsNullOrEmpty(e.UserId))
                .ToList();
            var scores = entries.ToDictionary(e => e.UserId, e => e.TotalScore);
            var order = entries.OrderBy(e => e.Rank).Select(e => e.UserId).ToList();
            return new PlayedMatch(row.Id, row.Slot, row.StageId, order, scores);
        }).ToList();
    }

    private async Task<List<string>?> EntryRankingAsync(Guid tournamentId)
    {
        var rows = await (
            from tp in db.TournamentPlayers.AsNoTracking()
            where tp.TournamentId == tournamentId
            orderby tp.EnrolledAt, tp.UserId
            select tp.UserId
        ).ToListAsync();

        return rows.Count > 0 ? rows.Select(g => g.ToString()).ToList() : null;
    }

    private static List<string> RankAfter(List<string> previous, List<PlayedMatch> played)
    {
        var scores = new Dictionary<string, int>();
        foreach (var match in played)
            foreach (var (userId, score) in match.Scores)
                scores[userId] = scores.GetValueOrDefault(userId) + score;

        var order = previous.Select((userId, index) => (userId, index))
            .ToDictionary(x => x.userId, x => x.index);

        // JS: sort by score desc, tie-break by previous-order index asc (stable).
        var playedIds = scores.Keys
            .OrderByDescending(a => scores[a])
            .ThenBy(a => order.GetValueOrDefault(a, int.MaxValue))
            .ToList();

        var idle = previous.Where(userId => !scores.ContainsKey(userId)).ToList();
        return [.. playedIds, .. idle];
    }

    private async Task<Dictionary<string, string>> NameOfAsync(IEnumerable<string> userIds)
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

    public async Task<int> TournamentPlacesAsync(string tournamentId)
        => await db.TournamentPlayers.AsNoTracking()
            .CountAsync(p => p.TournamentId == Guid.Parse(tournamentId));

    public async Task<FormatCheck> CheckMatchAgainstFormatAsync(
        string tournamentId, string stageId, int? slot, List<string> playerIds)
    {
        var tid = Guid.Parse(tournamentId);
        var tournament = await db.Tournaments.AsNoTracking()
            .FirstOrDefaultAsync(t => t.Id == tid && t.DeletedAt == null);
        if (tournament is null) return FormatCheck.Unchecked;

        var stages = tournament.StagesList
            .Select(s => (s.Id, Role: s.Role))
            .ToList();

        var index = stages.FindIndex(s => s.Id == stageId);
        if (index < 0) return FormatCheck.Unchecked;

        var role = stages[index].Role;
        if (role is null) return FormatCheck.Unchecked;

        var tierSize = tournament.FormatValue.CompetitorsPerMatch;

        var ranking = await EntryRankingAsync(tid);
        var toFinale = new List<string>();
        Ladder.LadderRound? ladderAfter = null;

        foreach (var stage in stages.Take(index))
        {
            var played = await PlayedMatchesAsync(tid, stage.Id);

            if (stage.Role == StageRole.splitting)
            {
                if (ranking is not null) ranking = RankAfter(ranking, played);
                continue;
            }

            if (stage.Role == StageRole.playoff)
            {
                if (ladderAfter is null)
                {
                    ladderAfter = ranking is not null
                        ? Ladder.InitialLadder(ranking, tierSize)
                        : null;
                }
                else if (played.Count > 0)
                {
                    var round = new Ladder.LadderRound(played.Select(ToLadderMatch).ToList());
                    var step = Ladder.LadderNext(round, toFinale);
                    ladderAfter = step.Next;
                    toFinale = step.ToFinale;
                }
            }
        }

        var names = await NameOfAsync(playerIds);

        if (role == StageRole.splitting)
        {
            if (ranking is null) return FormatCheck.Unchecked;
            if (ranking.Count != tierSize * tierSize) return FormatCheck.Unchecked;
            return new FormatCheck(true, Ladder.TierViolations([playerIds], ranking, tierSize));
        }

        if (role == StageRole.playoff)
        {
            var expected = ladderAfter;
            if (expected is null) return FormatCheck.Unchecked;
            if (slot is null) return FormatCheck.Unchecked;

            var wanted = expected.Matches.FirstOrDefault(m => m.Slot == slot);
            if (wanted is null) return FormatCheck.Unchecked;

            var actual = new List<Ladder.LadderMatch> { new(slot.Value, playerIds) };
            return new FormatCheck(true, Ladder.LadderViolations(
                new Ladder.LadderRound([wanted]), actual));
        }

        if (toFinale.Count == 0) return FormatCheck.Unchecked;

        var missing = toFinale.Where(userId => !playerIds.Contains(userId)).ToList();
        if (missing.Count > 0)
        {
            var label = Describe(missing, names);
            return new FormatCheck(true,
                [$"the finale seats the ladder winners — {label} are missing"]);
        }
        var extra = playerIds.Where(userId => !toFinale.Contains(userId)).ToList();
        if (extra.Count > 0)
        {
            var label = Describe(extra, names);
            return new FormatCheck(true,
                [$"the finale seats the ladder winners — {label} do not"]);
        }
        return new FormatCheck(true, []);
    }

    private static Ladder.LadderMatch ToLadderMatch(PlayedMatch played)
        => new(played.Slot ?? int.MaxValue, played.Order);

    private static string Describe(IEnumerable<string> userIds, Dictionary<string, string> names)
        => string.Join(", ", userIds.Select(id => names.GetValueOrDefault(id, id)));
}
