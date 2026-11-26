using Microsoft.EntityFrameworkCore;
using AOC.Api.Modules.Questions;
using AOC.Api.Modules.Standings;
using AOC.Domain.Contracts;
using AOC.Infrastructure.Data;
using AOC.Infrastructure.Data.Entities;

namespace AOC.Api.Modules.Matches;

public sealed class MatchTransitionService(
    AOCDbContext db,
    MatchesService matches,
    MatchScoringService scoring,
    StandingsService standings)
{
    private static readonly Dictionary<MatchStatus, MatchStatus[]> Edges = new()
    {
        [MatchStatus.UPCOMING] = [MatchStatus.LIVE],
        [MatchStatus.LIVE] = [MatchStatus.FINISHED],
        [MatchStatus.FINISHED] = []
    };

    public static bool CanTransition(MatchStatus from, MatchStatus to)
        => Edges.TryGetValue(from, out var allowed) && allowed.Contains(to);

    public async Task<MatchEntity> TransitionMatchAsync(string tournamentId, string matchId, string nextRaw)
    {
        var next = Enum.Parse<MatchStatus>(nextRaw);
        var mid = Guid.Parse(matchId);
        var tid = Guid.Parse(tournamentId);

        await using var transaction = await db.Database.BeginTransactionAsync();

        var existing = await db.Matches
            .FromSqlInterpolated($"SELECT * FROM matches WHERE id = {mid} FOR UPDATE")
            .FirstOrDefaultAsync();
        if (existing is null || existing.TournamentId != tid || existing.DeletedAt is not null)
            throw new MatchError(MatchErrorCode.NOT_FOUND, $"match {matchId} not found");
        if (existing.Status == next)
        {
            await transaction.CommitAsync();
            return existing;
        }

        if (!Edges[existing.Status].Contains(next))
            throw new MatchError(MatchErrorCode.INVALID_TRANSITION,
                $"cannot move a match from {existing.Status} to {next}",
                [$"allowed from {existing.Status}: {(Edges[existing.Status].Length > 0 ? string.Join(", ", Edges[existing.Status]) : "none")}"]);

        if (next == MatchStatus.LIVE)
        {
            var tournament = await matches.RequireTournamentAsync(tid);
            var shortfalls = new List<string>();

            var allowed = tournament.FormatValue.AllowedSeatCounts();
            if (!allowed.Contains(existing.PlayersList.Count))
                shortfalls.Add($"seats: {existing.PlayersList.Count} (allowed: {string.Join("/", allowed)})");
            if (existing.QuestionsList.Count == 0)
                shortfalls.Add("no questions assembled");

            if (tournament.RoundsList.Any(r => r.Id == "khoi-dong"))
            {
                var riengTurnId = Buckets.SlotForBucket("khoi-dong:rieng").TurnId;
                var perPlayer = existing.RoundConfigsMap.GetValueOrDefault("khoi-dong") is { } cfg
                    ? cfg.Turns.FirstOrDefault(t => t.Id == riengTurnId)?.QuestionCount ?? 6
                    : 6;
                var seats = existing.PlayersList.Count;
                var assembled = existing.QuestionsList
                    .Count(q => q.RoundId == "khoi-dong" && q.TurnId == riengTurnId);
                var needed = perPlayer * seats;
                if (assembled != needed)
                    shortfalls.Add(
                        $"khoi-dong Riêng: {assembled} assembled, needs {needed} ({perPlayer} × {seats} seat{(seats == 1 ? "" : "s")})");
            }

            if (tournament.RoundsList.Any(r => r.Id == "but-pha"))
            {
                var butPhaTurnId = Buckets.SlotForBucket("but-pha").TurnId;
                var butPhaCount = existing.RoundConfigsMap.GetValueOrDefault("but-pha") is { } bpCfg
                    ? bpCfg.Turns.FirstOrDefault(t => t.Id == butPhaTurnId)?.QuestionCount ?? 4
                    : 4;
                var butPhaAssembled = existing.QuestionsList
                    .Count(q => q.RoundId == "but-pha");
                if (butPhaAssembled != butPhaCount)
                    shortfalls.Add(
                        $"but-pha: {butPhaAssembled} assembled, needs exactly {butPhaCount}");
            }

            if (shortfalls.Count > 0)
                throw new MatchError(MatchErrorCode.NOT_READY,
                    $"match {matchId} is not ready to go live", shortfalls);
        }

        existing.Status = next;
        existing.UpdatedAt = DateTime.UtcNow;

        if (next == MatchStatus.LIVE)
        {
            var tournament = await matches.RequireTournamentAsync(tid);
            var ordered = MatchRounds.OrderedMatchRounds(tournament.RoundsList, existing.RoundConfigsMap);
            var first = MatchRounds.NextRoundId(ordered, null);
            if (first is not null && !await db.MatchLive.AnyAsync(l => l.MatchId == mid))
            {
                db.MatchLive.Add(new MatchLiveEntity
                {
                    MatchId = mid,
                    Version = 0,
                    RoundId = first,
                    State = JsonDefaults.EmptyObject,
                    Archive = JsonDefaults.EmptyObject,
                    UpdatedAt = DateTime.UtcNow
                });
            }
        }

        if (next == MatchStatus.FINISHED)
        {
            await scoring.ScoreMatchAsync(mid, existing);
            await db.SaveChangesAsync();
            await standings.RecomputeStandingsAsync(tournamentId);
        }

        await db.SaveChangesAsync();
        await transaction.CommitAsync();

        return existing;
    }
}
