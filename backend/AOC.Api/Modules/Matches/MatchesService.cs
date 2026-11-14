using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using AOC.Api.Http;
using AOC.Api.Modules.Bracket;
using AOC.Api.Modules.Questions;
using AOC.Api.Modules.Recording;
using AOC.Api.Modules.Standings;
using AOC.Domain.Contracts;
using AOC.Domain.Engine;
using AOC.Infrastructure.Data;
using AOC.Infrastructure.Data.Entities;

namespace AOC.Api.Modules.Matches;

/// <summary>Port of matches/service.ts.</summary>
public sealed class MatchesService(
    AOCDbContext db,
    BracketService bracket,
    StandingsService standings,
    RecordingService recording,
    ILogger<MatchesService> logger)
{
    private static readonly Dictionary<MatchStatus, MatchStatus[]> Edges = new()
    {
        [MatchStatus.UPCOMING] = [MatchStatus.LIVE],
        [MatchStatus.LIVE] = [MatchStatus.FINISHED],
        [MatchStatus.FINISHED] = []
    };

    public sealed record MatchScope(TournamentEntity Tournament);

    // ---- lookups ----------------------------------------------------------------

    public async Task<TournamentEntity> RequireTournamentAsync(Guid tournamentId)
        => await db.Tournaments.AsNoTracking()
               .FirstOrDefaultAsync(t => t.Id == tournamentId && t.DeletedAt == null)
           ?? throw new MatchError(MatchErrorCode.NOT_FOUND, $"tournament {tournamentId} not found");

    public async Task<MatchScope> RequireMatchScopeAsync(string tournamentId)
        => new(await RequireTournamentAsync(Guid.Parse(tournamentId)));

    public async Task<MatchEntity> GetMatchAsync(string tournamentId, string matchId)
        => await FindMatchAsync(Guid.Parse(tournamentId), Guid.Parse(matchId))
           ?? throw new MatchError(MatchErrorCode.NOT_FOUND, $"match {matchId} not found");

    public async Task<MatchEntity> GetMatchByIdAsync(string matchId)
        => await db.Matches.AsNoTracking()
               .FirstOrDefaultAsync(m => m.Id == Guid.Parse(matchId) && m.DeletedAt == null)
           ?? throw new MatchError(MatchErrorCode.NOT_FOUND, $"match {matchId} not found");

    private Task<MatchEntity?> FindMatchAsync(Guid tournamentId, Guid matchId)
        => db.Matches.AsNoTracking().FirstOrDefaultAsync(m =>
            m.Id == matchId && m.TournamentId == tournamentId && m.DeletedAt == null);

    public async Task<List<object>> GetMatchAssemblyEventsAsync(string matchId)
    {
        var mid = Guid.Parse(matchId);
        var rows = await db.MatchAssemblyEvents.AsNoTracking()
            .Where(e => e.MatchId == mid)
            .OrderByDescending(e => e.Revision)
            .ThenByDescending(e => e.At)
            .Take(20)
            .ToListAsync();
        return rows.Select(e => (object)new
        {
            e.Id,
            e.MatchId,
            e.Revision,
            e.ActorId,
            e.Mode,
            e.AddedCount,
            e.RemovedCount,
            e.SourceIds,
            e.At
        }).ToList();
    }

    // ---- validation ---------------------------------------------------------------

    private static void AssertRoundConfigKeys(TournamentEntity tournament, Dictionary<string, RoundConfig> roundConfigs)
    {
        var roundIds = tournament.RoundsList.Select(r => r.Id).ToHashSet();
        var unknown = roundConfigs.Keys.Where(id => !roundIds.Contains(id)).ToList();
        if (unknown.Count > 0)
            throw new MatchError(MatchErrorCode.VALIDATION,
                "roundConfigs contains rounds that are not part of this tournament",
                unknown.Select(id => $"unknown round id \"{id}\"").ToList());
    }

    private static void AssertSeats(List<Seat> players, TournamentFormat format)
    {
        var counts = format.AllowedSeatCounts();
        if (!counts.Contains(players.Count))
            throw new MatchError(MatchErrorCode.VALIDATION,
                $"expected {string.Join(" or ", counts)} seats, got {players.Count}");

        var seeds = players.Select(s => s.Seed).ToList();
        if (seeds.Distinct().Count() != seeds.Count)
            throw new MatchError(MatchErrorCode.VALIDATION, "seat seeds must be unique");
    }

    private async Task AssertFollowsFormatAsync(string tournamentId, string stageId, int? slot, List<Seat> players)
    {
        var playerIds = players
            .Where(s => s.Kind == "user" && Guid.TryParse(s.UserId, out _))
            .Select(s => s.UserId)
            .ToList();

        var check = await bracket.CheckMatchAgainstFormatAsync(tournamentId, stageId, slot, playerIds);
        if (check.Checked && check.Problems.Count > 0)
            throw new MatchError(MatchErrorCode.VALIDATION,
                $"this match breaks the format of stage \"{stageId}\"",
                check.Problems);
    }

    // ---- scoring on FINISHED -------------------------------------------------------

    private async Task ScoreMatchAsync(Guid matchId, MatchEntity match)
    {
        var rows = await db.Answers.AsNoTracking().Where(a => a.MatchId == matchId).ToListAsync();

        var unjudged = rows.Where(r => !r.Judged).ToList();
        if (unjudged.Count > 0)
            throw new MatchError(MatchErrorCode.NOT_READY,
                $"match {matchId} has {unjudged.Count} answer(s) without a final verdict");

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

        var results = MatchScoring.BuildMatchResults(new MatchScoring.MatchResultInput(
            competitors,
            rows.Select(r => new MatchScoring.AnswerForScoring(
                r.UserId.ToString(),
                questionById.TryGetValue(r.QuestionId.ToString(), out var q) ? q.RoundId : "unknown",
                r.PointsAwarded ?? 0)).ToList(),
            adjustments.ToDictionary(kv => kv.Key.ToString(), kv => kv.Value)));

        // ON CONFLICT DO NOTHING — the PK is the conflict target.
        var already = await db.MatchResults.AnyAsync(m => m.MatchId == matchId);
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

    // ---- create -------------------------------------------------------------------

    private sealed class MatchAssemblyAccessor
    {
        public required MatchAssembly Assembly { get; init; }
    }

    public async Task<MatchEntity> CreateMatchAsync(string tournamentId, MatchSchemas.CreateMatchInput input)
    {
        var tid = Guid.Parse(tournamentId);
        var tournament = await RequireTournamentAsync(tid);

        var stages = tournament.StagesList;
        if (stages.Count == 0)
            throw new MatchError(MatchErrorCode.NOT_READY,
                "this tournament has no stages yet — add them before creating matches");
        if (!stages.Any(s => s.Id == input.StageId))
            throw new MatchError(MatchErrorCode.VALIDATION,
                $"the stage \"{input.StageId}\" is not one of this tournament's stages",
                stages.Select(s => s.Id).ToList());

        var given = input.RoundConfigs ?? new Dictionary<string, RoundConfig>();
        var hasRules = tournament.RoundRulesMap is { Count: > 0 };

        Dictionary<string, RoundConfig> roundConfigs;
        if (given.Count > 0)
        {
            roundConfigs = given;
        }
        else if (hasRules)
        {
            roundConfigs = StageInputs.TournamentRoundConfigs(tournament);
        }
        else
        {
            roundConfigs = AocRulebook.ResolveRoundRules(tournament.RoundsList, tournament.RoundRulesMap);
        }

        if (roundConfigs.Count > 0) AssertRoundConfigKeys(tournament, roundConfigs);
        if (input.Players is not null) AssertSeats(input.Players, tournament.FormatValue);
        if (input.Players is not null)
            await AssertFollowsFormatAsync(tournamentId, input.StageId, input.Slot, input.Players);

        var assembly = new MatchAssembly(db);
        var questions = await assembly.BuildQuestionCopiesAsync(
            tournament, roundConfigs, input.Questions ?? []);

        var row = new MatchEntity
        {
            TournamentId = tid,
            StageId = input.StageId,
            Slot = input.Slot,
            Label = input.Label,
            ScheduledAt = DateTime.Parse(input.ScheduledAt, null,
                System.Globalization.DateTimeStyles.AdjustToUniversal | System.Globalization.DateTimeStyles.AssumeUniversal),
            Status = MatchStatus.UPCOMING,
            Players = JsonDefaults.Serialize(input.Players ?? []),
            RoundConfigs = JsonDefaults.Serialize(roundConfigs),
            Questions = JsonDefaults.Serialize(questions),
            Live = null,
            Discord = null
        };
        db.Matches.Add(row);
        await db.SaveChangesAsync();
        return row;
    }

    public async Task<PageResult<MatchEntity>> ListMatchesAsync(
        string tournamentId, string? statusFilter, Page page)
    {
        var tid = Guid.Parse(tournamentId);
        var query = db.Matches.AsNoTracking()
            .Where(m => m.TournamentId == tid && m.DeletedAt == null);
        if (statusFilter is not null)
        {
            var status = Enum.Parse<MatchStatus>(statusFilter);
            query = query.Where(m => m.Status == status);
        }

        var total = await query.CountAsync();
        var items = await query
            .OrderBy(m => m.ScheduledAt)
            .ThenBy(m => m.Id)
            .Skip(page.Offset)
            .Take(page.Limit)
            .ToListAsync();

        return Pagination.Result(items, total, page);
    }

    // ---- update --------------------------------------------------------------------

    public async Task<MatchEntity> UpdateMatchAsync(string tournamentId, string matchId, MatchSchemas.UpdateMatchInput patch)
    {
        var existing = await GetMatchAsync(tournamentId, matchId);
        if (existing.Status != MatchStatus.UPCOMING)
            throw new MatchError(MatchErrorCode.IMMUTABLE,
                $"match {matchId} is {existing.Status} and can no longer be edited");

        var tournament = await RequireTournamentAsync(Guid.Parse(tournamentId));
        if (patch.Players is not null) AssertSeats(patch.Players, tournament.FormatValue);
        if (patch.Players is not null)
            await AssertFollowsFormatAsync(tournamentId,
                patch.StageId ?? existing.StageId, existing.Slot, patch.Players);
        if (patch.RoundConfigs is not null) AssertRoundConfigKeys(tournament, patch.RoundConfigs);

        var tracked = await db.Matches.FirstAsync(m => m.Id == Guid.Parse(matchId));
        if (patch.StageId is not null) tracked.StageId = patch.StageId;
        if (patch.Label is not null) tracked.Label = patch.Label;
        if (patch.ScheduledAt is not null)
            tracked.ScheduledAt = DateTime.Parse(patch.ScheduledAt, null,
                System.Globalization.DateTimeStyles.AdjustToUniversal | System.Globalization.DateTimeStyles.AssumeUniversal);
        if (patch.HasPlayers && patch.Players is not null)
            tracked.Players = JsonDefaults.Serialize(patch.Players);
        if (patch.HasRoundConfigs && patch.RoundConfigs is not null)
            tracked.RoundConfigs = JsonDefaults.Serialize(patch.RoundConfigs);
        tracked.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return tracked;
    }

    public async Task<MatchEntity> EjectSeatAsync(string tournamentId, string matchId, string userId)
    {
        var mid = Guid.Parse(matchId);
        var uid = Guid.Parse(userId);

        var match = await db.Matches.FirstOrDefaultAsync(m =>
            m.Id == mid && m.TournamentId == Guid.Parse(tournamentId) && m.DeletedAt == null);
        if (match is null)
            throw new MatchError(MatchErrorCode.NOT_FOUND, $"match {matchId} not found");
        if (match.Status != MatchStatus.UPCOMING)
            throw new MatchError(MatchErrorCode.IMMUTABLE,
                $"match {matchId} is {match.Status} and its seats can no longer be changed");

        var seats = match.PlayersList;
        if (!MatchSeats.IsSeatedInMatch(seats, uid))
            throw new MatchError(MatchErrorCode.NOT_FOUND, $"no seat for {userId} in match {matchId}");

        var next = seats
            .Where(s => !(s.Kind == "user" && Guid.TryParse(s.UserId, out var id) && id == uid))
            .ToList();
        match.Players = JsonDefaults.Serialize(next);
        match.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return match;
    }

    public async Task<MatchEntity> AssembleMatchAsync(string tournamentId, string matchId, List<AssemblyEntry> entries)
    {
        var existing = await GetMatchAsync(tournamentId, matchId);
        if (existing.Status != MatchStatus.UPCOMING)
            throw new MatchError(MatchErrorCode.IMMUTABLE,
                $"match {matchId} is {existing.Status} and can no longer be assembled");
        if (entries.Count == 0)
            throw new MatchError(MatchErrorCode.VALIDATION, "provide questions");

        var tournament = await RequireTournamentAsync(Guid.Parse(tournamentId));
        var assembly = new MatchAssembly(db);
        var questions = await assembly.BuildQuestionCopiesAsync(
            tournament, existing.RoundConfigsMap, entries);

        var tracked = await db.Matches.FirstAsync(m => m.Id == Guid.Parse(matchId));
        tracked.Questions = JsonDefaults.Serialize(questions);
        tracked.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return tracked;
    }

    // ---- results & transitions -------------------------------------------------------

    public async Task<MatchEntity> SetMatchResultsAsync(string tournamentId, string matchId,
        List<(string UserId, int Score)> totals)
    {
        var mid = Guid.Parse(matchId);
        var match = await GetMatchAsync(tournamentId, matchId);

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

        var tracked = await db.Matches.FirstAsync(m => m.Id == mid);
        tracked.Status = MatchStatus.FINISHED;
        tracked.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        await standings.RecomputeStandingsAsync(tournamentId);

        // Results frozen = the show is over; close the recording (fire-and-forget).
        _ = recording.AutoStopRecordingAsync(matchId);

        return tracked;
    }

    public async Task<MatchEntity> TransitionMatchAsync(string tournamentId, string matchId, string nextRaw)
    {
        var next = Enum.Parse<MatchStatus>(nextRaw);
        var mid = Guid.Parse(matchId);
        var tid = Guid.Parse(tournamentId);

        var existing = await GetMatchAsync(tournamentId, matchId);
        if (existing.Status == next) return existing;

        if (!Edges[existing.Status].Contains(next))
            throw new MatchError(MatchErrorCode.INVALID_TRANSITION,
                $"cannot move a match from {existing.Status} to {next}",
                [$"allowed from {existing.Status}: {(Edges[existing.Status].Length > 0 ? string.Join(", ", Edges[existing.Status]) : "none")}"]);

        if (next == MatchStatus.LIVE)
        {
            var tournament = await RequireTournamentAsync(tid);
            var shortfalls = new List<string>();

            var allowed = tournament.FormatValue.AllowedSeatCounts();
            if (!allowed.Contains(existing.PlayersList.Count))
                shortfalls.Add($"seats: {existing.PlayersList.Count} (allowed: {string.Join("/", allowed)})");
            if (existing.QuestionsList.Count == 0)
                shortfalls.Add("no questions assembled");

            // Riêng is one set of six per seat — catch a short bundle HERE.
            if (tournament.RoundsList.Any(r => r.Id == "khoi-dong"))
            {
                var perPlayer = existing.RoundConfigsMap.GetValueOrDefault("khoi-dong") is { } cfg
                    ? cfg.Turns.FirstOrDefault(t => t.Id == "phase1")?.QuestionCount ?? 6
                    : 6;
                var seats = existing.PlayersList.Count;
                var assembled = existing.QuestionsList
                    .Count(q => q.RoundId == "khoi-dong" && q.TurnId == "phase1");
                var needed = perPlayer * seats;
                if (assembled != needed)
                    shortfalls.Add(
                        $"khoi-dong Riêng: {assembled} assembled, needs {needed} ({perPlayer} × {seats} seat{(seats == 1 ? "" : "s")})");
            }

            if (shortfalls.Count > 0)
                throw new MatchError(MatchErrorCode.NOT_READY,
                    $"match {matchId} is not ready to go live", shortfalls);
        }

        var tracked = await db.Matches.FirstAsync(m => m.Id == mid);
        tracked.Status = next;
        tracked.UpdatedAt = DateTime.UtcNow;

        if (next == MatchStatus.LIVE)
        {
            var tournament = await RequireTournamentAsync(tid);
            var ordered = MatchRounds.OrderedMatchRounds(tournament.RoundsList, tracked.RoundConfigsMap);
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
            await ScoreMatchAsync(mid, tracked);

        await db.SaveChangesAsync();

        if (next == MatchStatus.FINISHED)
            await standings.RecomputeStandingsAsync(tournamentId);

        if (next == MatchStatus.LIVE)
            _ = recording.AutoStartRecordingAsync(tournamentId, matchId);
        if (next == MatchStatus.FINISHED)
            _ = recording.AutoStopRecordingAsync(matchId);

        return tracked;
    }

    public async Task<MatchEntity> DeleteMatchAsync(string tournamentId, string matchId)
    {
        var existing = await GetMatchAsync(tournamentId, matchId);
        if (existing.Status != MatchStatus.UPCOMING)
            throw new MatchError(MatchErrorCode.IMMUTABLE,
                $"match {matchId} is {existing.Status} and cannot be deleted");

        var tracked = await db.Matches.FirstAsync(m => m.Id == Guid.Parse(matchId));
        tracked.DeletedAt = DateTime.UtcNow;
        tracked.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return tracked;
    }
}
