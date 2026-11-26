using Microsoft.EntityFrameworkCore;
using AOC.Domain.Contracts;
using AOC.Infrastructure.Data;
using AOC.Infrastructure.Data.Entities;

namespace AOC.Api.Modules.Matches;

public sealed class MatchAssemblyService(AOCDbContext db)
{
    public async Task<List<MatchAssemblyEvent>> EventsAsync(string matchId)
    {
        var mid = Guid.Parse(matchId);
        var rows = await db.MatchAssemblyEvents.AsNoTracking()
            .Where(e => e.MatchId == mid)
            .OrderByDescending(e => e.Revision)
            .ThenByDescending(e => e.At)
            .Take(20)
            .ToListAsync();
        return rows.Select(MatchAssemblyEvent.Of).ToList();
    }

    public Task<List<MatchQuestion>> BuildQuestionsAsync(
        TournamentEntity tournament,
        Dictionary<string, RoundConfig> roundConfigs,
        IReadOnlyList<AssemblyEntry> entries)
        => new MatchAssembly(db).BuildQuestionCopiesAsync(tournament, roundConfigs, entries);
}
