using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using AOC.Api.Http;
using AOC.Domain.Contracts;
using AOC.Domain.Gameplay;
using AOC.Infrastructure.Data;
using AOC.Infrastructure.Data.Entities;

namespace AOC.Api.Modules.Matches;

public sealed class MatchesService(AOCDbContext db, MatchAssemblyService assembly)
{
    public sealed record MatchScope(TournamentEntity Tournament, MatchEntity Match);


    public async Task<TournamentEntity> RequireTournamentAsync(Guid tournamentId)
        => await db.Tournaments.AsNoTracking()
               .FirstOrDefaultAsync(t => t.Id == tournamentId && t.DeletedAt == null)
           ?? throw new MatchError(MatchErrorCode.NOT_FOUND, $"tournament {tournamentId} not found");

    public async Task<MatchScope> RequireMatchScopeAsync(string tournamentId, string matchId)
    {
        var tournament = await RequireTournamentAsync(Guid.Parse(tournamentId));
        var match = await GetMatchAsync(tournamentId, matchId);
        return new MatchScope(tournament, match);
    }

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

        var questions = await assembly.BuildQuestionsAsync(
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

    public async Task<PageResult<MatchSummary>> ListMatchesAsync(
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

        return Pagination.Result(items.Select(MatchSummary.Of).ToList(), total, page);
    }


    public async Task<MatchEntity> UpdateMatchAsync(string tournamentId, string matchId, MatchSchemas.UpdateMatchInput patch)
    {
        var existing = await GetMatchAsync(tournamentId, matchId);
        if (existing.Status != MatchStatus.UPCOMING)
            throw new MatchError(MatchErrorCode.IMMUTABLE,
                $"match {matchId} is {existing.Status} and can no longer be edited");

        var tournament = await RequireTournamentAsync(Guid.Parse(tournamentId));
        if (patch.Players is not null) AssertSeats(patch.Players, tournament.FormatValue);
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
