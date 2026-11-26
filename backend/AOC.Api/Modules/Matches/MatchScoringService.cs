using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using AOC.Domain.Contracts;
using AOC.Domain.Gameplay;
using AOC.Infrastructure.Data;
using AOC.Infrastructure.Data.Entities;

namespace AOC.Api.Modules.Matches;

public sealed class MatchScoringService(AOCDbContext db)
{
    public async Task ScoreMatchAsync(Guid matchId, MatchEntity match)
    {
        var already = await db.MatchResults.AnyAsync(m => m.MatchId == matchId);

        var rows = await db.Answers.AsNoTracking().Where(a => a.MatchId == matchId).ToListAsync();

        if (!already)
        {
            var unjudged = rows.Where(r => r.Verdict is null).ToList();
            if (unjudged.Count > 0)
                throw new MatchError(MatchErrorCode.NOT_READY,
                    $"match {matchId} has {unjudged.Count} answer(s) without a final verdict");
        }

        var questionById = match.QuestionsList.ToDictionary(q => q.Id);
        var competitors = match.PlayersList
            .Where(s => s.Kind == "user")
            .Select(s => s.UserId)
            .ToList();

        var adjustmentRows = await db.ScoreAdjustments.AsNoTracking()
            .Where(a => a.MatchId == matchId)
            .Select(a => new { a.UserId, a.Delta })
            .ToListAsync();
        var adjustments = adjustmentRows
            .GroupBy(a => a.UserId)
            .ToDictionary(g => g.Key, g => g.Sum(a => a.Delta));

        var tieBreakRow = await db.MatchLive.AsNoTracking()
            .Where(l => l.MatchId == matchId)
            .Select(l => l.Tiebreak)
            .FirstOrDefaultAsync();
        var tieBreak = tieBreakRow is { } raw
            ? JsonDefaults.Deserialize<AOC.Domain.Gameplay.Turns.TieBreakState>(raw)
            : null;

        var results = MatchScoring.BuildMatchResults(new MatchScoring.MatchResultInput(
            competitors,
            rows.Select(r => new MatchScoring.AnswerForScoring(
                r.UserId.ToString(),
                questionById.TryGetValue(r.QuestionId.ToString(), out var q) ? q.RoundId : "unknown",
                r.PointsAwarded ?? 0)).ToList(),
            adjustments.ToDictionary(kv => kv.Key.ToString(), kv => kv.Value),
            tieBreak?.Correct,
            tieBreak?.BuzzMs));

        if (!already)
        {
            db.MatchResults.Add(new MatchResultEntity
            {
                MatchId = matchId,
                TournamentId = match.TournamentId,
                Results = JsonDefaults.Serialize(results),
                ComputedAt = DateTime.UtcNow
            });
        }

        if (rows.Count > 0)
        {
            var existingStats = await db.MatchStats
                .Where(s => s.MatchId == matchId)
                .Select(s => new { s.RoundId, s.QuestionId, s.UserId })
                .ToListAsync();
            var existingKeys = existingStats
                .Select(s => (s.RoundId, QuestionId: s.QuestionId, s.UserId))
                .ToHashSet();

            foreach (var r in rows)
            {
                questionById.TryGetValue(r.QuestionId.ToString(), out var question);
                var key = (question?.RoundId ?? "unknown", r.QuestionId, r.UserId);
                if (existingKeys.Contains(key)) continue;
                db.MatchStats.Add(new MatchStatEntity
                {
                    MatchId = matchId,
                    TournamentId = match.TournamentId,
                    RoundId = question?.RoundId ?? "unknown",
                    QuestionId = r.QuestionId,
                    UserId = r.UserId,
                    BasePoints = question?.Points,
                    Answered = true,
                    Correct = r.Verdict == Verdict.CORRECT,
                    Verdict = r.Verdict,
                    PointsAwarded = r.PointsAwarded
                });
                existingKeys.Add(key);
            }
        }

        await db.SaveChangesAsync();
    }

    public async Task<MatchEntity> SetMatchResultsAsync(string tournamentId, string matchId,
        List<(string UserId, int Score)> totals)
    {
        var mid = Guid.Parse(matchId);
        var match = await MatchAsync(tournamentId, matchId);

        if (match.Status == MatchStatus.FINISHED)
            throw new MatchError(MatchErrorCode.VALIDATION,
                "match is already finished; results are frozen");

        var seated = match.PlayersList
            .Where(s => s.Kind == "user")
            .Select(s => s.UserId)
            .ToList();

        var given = totals.Select(t => t.UserId).ToHashSet();
        if (given.Count != totals.Count)
            throw new MatchError(MatchErrorCode.VALIDATION, "totals list the same player twice");
        if (seated.Count != totals.Count || seated.Any(userId => !given.Contains(userId)))
            throw new MatchError(MatchErrorCode.VALIDATION,
                "totals must cover exactly the players seated in this match",
                [$"seated: {seated.Count}, given: {totals.Count}"]);

        var results = totals
            .OrderByDescending(t => t.Score)
            .Select((row, index) => new ResultEntry
            {
                Kind = "user",
                UserId = row.UserId,
                TotalScore = row.Score,
                Rank = index + 1,
                RoundScores = new Dictionary<string, int>()
            })
            .ToList();

        var existingResult = await db.MatchResults.FirstOrDefaultAsync(r => r.MatchId == mid);
        if (existingResult is null)
        {
            db.MatchResults.Add(new MatchResultEntity
            {
                MatchId = mid,
                TournamentId = match.TournamentId,
                Results = JsonDefaults.Serialize(results),
                ComputedAt = DateTime.UtcNow
            });
        }
        else
        {
            existingResult.Results = JsonDefaults.Serialize(results);
            existingResult.ComputedAt = DateTime.UtcNow;
        }

        await db.SaveChangesAsync();

        return match;
    }

    private async Task<MatchEntity> MatchAsync(string tournamentId, string matchId)
        => await db.Matches.AsNoTracking().FirstOrDefaultAsync(m =>
               m.Id == Guid.Parse(matchId)
               && m.TournamentId == Guid.Parse(tournamentId)
               && m.DeletedAt == null)
           ?? throw new MatchError(MatchErrorCode.NOT_FOUND, $"match {matchId} not found");
}
