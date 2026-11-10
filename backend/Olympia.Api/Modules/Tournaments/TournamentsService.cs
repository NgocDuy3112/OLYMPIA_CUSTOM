using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Olympia.Api.Http;
using Olympia.Api.Shared;
using Olympia.Domain.Contracts;
using Olympia.Domain.Engine;
using Olympia.Infrastructure.Data;
using Olympia.Infrastructure.Data.Entities;

namespace Olympia.Api.Modules.Tournaments;

/// <summary>Port of tournaments/slug.ts.</summary>
public static class TournamentsSlug
{
    public static string Slugify(string name)
    {
        var decomposed = name.Normalize(NormalizationForm.FormD);
        var chars = new List<char>(decomposed.Length);
        foreach (var c in decomposed)
            if (System.Globalization.CharUnicodeInfo.GetUnicodeCategory(c) != System.Globalization.UnicodeCategory.NonSpacingMark)
                chars.Add(c);
        var slug = new string(chars.ToArray())
            .Normalize(NormalizationForm.FormC)
            .Replace('đ', 'd')
            .Replace('Đ', 'D')
            .ToLowerInvariant()
            .Trim();
        slug = System.Text.RegularExpressions.Regex.Replace(slug, "[^a-z0-9]+", "-").Trim('-');
        if (slug.Length > 100) slug = slug[..100];
        return slug.TrimEnd('-');
    }
}

/// <summary>Port of tournaments/service.ts.</summary>
public sealed class TournamentsService(OlympiaDbContext db)
{
    private static async Task<string> UniqueSlugAsync(OlympiaDbContext db, string name, Guid? exceptId = null)
    {
        var baseName = TournamentsSlug.Slugify(name);
        if (string.IsNullOrEmpty(baseName)) baseName = "tournament";

        for (var attempt = 0; attempt < 100; attempt++)
        {
            var candidate = attempt == 0 ? baseName : $"{baseName}-{attempt + 1}";
            var taken = await db.Tournaments.FirstOrDefaultAsync(t => t.Slug == candidate);
            if (taken is null || taken.Id == exceptId) return candidate;
        }

        throw new TournamentError(TournamentErrorCode.CONFLICT, $"could not find a free slug for \"{name}\"");
    }

    private static void AssertRoundRules(IEnumerable<TournamentRound> rounds, Dictionary<string, RoundConfig> rules)
    {
        var known = rounds.Select(r => r.Id).ToHashSet();
        var unknown = rules.Keys.Where(id => !known.Contains(id)).ToList();
        if (unknown.Count > 0)
            throw new TournamentError(TournamentErrorCode.VALIDATION,
                "roundRules names rounds this tournament does not have",
                unknown.Select(id => $"unknown round id \"{id}\"").ToList());

        foreach (var (roundId, config) in rules)
        {
            if (config.AllowedKinds.Count == 0)
                throw new TournamentError(TournamentErrorCode.VALIDATION,
                    $"round \"{roundId}\" allows no question kinds");
            var turnIds = config.Turns.Select(t => t.Id).ToList();
            if (turnIds.Distinct().Count() != turnIds.Count)
                throw new TournamentError(TournamentErrorCode.VALIDATION,
                    $"round \"{roundId}\" has a duplicate turn id");
        }
    }

    public async Task<TournamentEntity> RequireTournamentAsync(string tournamentId)
    {
        var id = Guid.Parse(tournamentId);
        var row = await db.Tournaments.AsNoTracking()
            .FirstOrDefaultAsync(t => t.Id == id && t.DeletedAt == null);
        if (row is null)
            throw new TournamentError(TournamentErrorCode.NOT_FOUND, $"tournament {tournamentId} not found");
        return row;
    }

    public async Task<TournamentEntity> CreateTournamentAsync(Guid ownerId, JsonElement input)
    {
        var dto = ParseCreate(input);
        var slug = await UniqueSlugAsync(db, dto.Name);

        if (dto.Current == true)
        {
            var currentOwned = await db.Tournaments
                .Where(t => t.OwnerId == ownerId && t.Current)
                .ToListAsync();
            foreach (var t in currentOwned) t.Current = false;
        }

        JsonElement roundsJson;
        if (dto.Rounds is { Count: > 0 } rounds)
        {
            roundsJson = JsonDefaults.Serialize(rounds);
        }
        else
        {
            roundsJson = JsonDefaults.Serialize(AocRulebook.AocRounds);
        }

        JsonElement formatJson;
        if (dto.Format is not null)
        {
            formatJson = JsonDefaults.Serialize(dto.Format);
        }
        else
        {
            formatJson = JsonDefaults.Serialize(new TournamentFormat
            {
                CompetitorsPerMatch = 4,
                AllowedCompetitorCounts = [3, 4]
            });
        }

        var row = new TournamentEntity
        {
            OwnerId = ownerId,
            Name = dto.Name,
            Slug = slug,
            Visibility = dto.Visibility ?? Visibility.PUBLIC,
            Rounds = roundsJson,
            Format = formatJson,
            RoundRules = dto.RoundRules is null ? null : JsonDefaults.Serialize(dto.RoundRules),
            Stages = JsonDefaults.Serialize(dto.Stages ?? []),
            Current = dto.Current ?? false
        };
        db.Tournaments.Add(row);
        await db.SaveChangesAsync();
        return row;
    }

    public async Task<PageResult<TournamentEntity>> ListTournamentsAsync(
        bool? current, bool? mine, Guid ownerId, Page page, Guid viewerId, string viewerRole)
    {
        var query = db.Tournaments.AsNoTracking().Where(t => t.DeletedAt == null);

        if (current is not null) query = query.Where(t => t.Current == current);
        if (mine is true) query = query.Where(t => t.OwnerId == ownerId);
        if (viewerRole != "ADMIN")
            query = query.Where(t => t.Visibility == Visibility.PUBLIC || t.OwnerId == viewerId);

        var total = await query.CountAsync();
        var items = await query
            .OrderBy(t => t.CreatedAt)
            .Skip(page.Offset)
            .Take(page.Limit)
            .ToListAsync();

        return Pagination.Result(items, total, page);
    }

    private sealed record CreateDto(
        string Name,
        Visibility? Visibility,
        List<Stage>? Stages,
        List<TournamentRound>? Rounds,
        TournamentFormat? Format,
        Dictionary<string, RoundConfig>? RoundRules,
        bool? Current);

    private static CreateDto ParseCreate(JsonElement input)
    {
        try
        {
            var obj = Validate.Object(input);
            var name = Validate.RequiredString(obj, "name", minLength: 1);
            Visibility? visibility = null;
            if (obj.TryGetProperty("visibility", out var v) && v.ValueKind != JsonValueKind.Null)
                visibility = v.GetString() switch
                {
                    "PUBLIC" => Visibility.PUBLIC,
                    "PRIVATE" => Visibility.PRIVATE,
                    _ => throw new JsonException("visibility must be PUBLIC or PRIVATE")
                };

            List<Stage>? stages = null;
            if (obj.TryGetProperty("stages", out var st) && st.ValueKind != JsonValueKind.Null)
                stages = st.Deserialize<List<Stage>>(JsonApi.Options);

            List<TournamentRound>? rounds = null;
            if (obj.TryGetProperty("rounds", out var rd) && rd.ValueKind != JsonValueKind.Null)
                rounds = rd.Deserialize<List<TournamentRound>>(JsonApi.Options);

            TournamentFormat? format = null;
            if (obj.TryGetProperty("format", out var fm) && fm.ValueKind != JsonValueKind.Null)
                format = fm.Deserialize<TournamentFormat>(JsonApi.Options);

            Dictionary<string, RoundConfig>? roundRules = null;
            if (obj.TryGetProperty("roundRules", out var rr) && rr.ValueKind != JsonValueKind.Null)
                roundRules = rr.Deserialize<Dictionary<string, RoundConfig>>(JsonApi.Options);

            var current = Validate.OptionalBool(obj, "current");
            return new CreateDto(name, visibility, stages, rounds, format, roundRules, current);
        }
        catch (JsonException ex)
        {
            throw new TournamentError(TournamentErrorCode.VALIDATION,
                "Tournament payload failed validation", new[] { $"<root>: {ex.Message}" });
        }
    }

    public async Task<TournamentEntity> UpdateTournamentAsync(string tournamentId, JsonElement patchInput)
    {
        var id = Guid.Parse(tournamentId);
        var existing = await RequireTournamentAsync(tournamentId);

        JsonElement? patch = patchInput.ValueKind == JsonValueKind.Object ? patchInput : null;
        if (patch is null)
            throw new TournamentError(TournamentErrorCode.VALIDATION,
                "Tournament payload failed validation", new[] { "<root>: Expected object" });

        // Update is a partial of Create — validate only the fields present.
        var obj = patch.Value;

        var frozen = existing.ClosedAt is not null || await HasAssembledMatchAsync(id);

        JsonElement? patchRules = null;
        if (obj.TryGetProperty("roundRules", out var rulesEl) && rulesEl.ValueKind != JsonValueKind.Null)
        {
            patchRules = rulesEl;
        }
        var changesRules = patchRules is not null
            && !JsonElementEquals(patchRules.Value, existing.RoundRules);
        var changesStages = obj.TryGetProperty("stages", out var stagesEl) && stagesEl.ValueKind != JsonValueKind.Null
            && !JsonElementEquals(stagesEl, existing.Stages);

        if (changesStages && existing.ClosedAt is not null)
            throw new TournamentError(TournamentErrorCode.CONFLICT,
                "the stages are frozen once the tournament is closed");

        if (changesRules && frozen)
            throw new TournamentError(TournamentErrorCode.CONFLICT,
                "round rules are frozen once a match has been assembled");

        if (obj.TryGetProperty("rounds", out var roundsEl) && roundsEl.ValueKind != JsonValueKind.Null)
        {
            var rounds = roundsEl.Deserialize<List<TournamentRound>>(JsonApi.Options);
            var rules = patchRules is { } pr
                ? pr.Deserialize<Dictionary<string, RoundConfig>>(JsonApi.Options)
                : null;
            if (rules is not null) AssertRoundRules(rounds, rules);
        }
        else if (patchRules is not null)
        {
            var rounds = existing.RoundsList;
            var rules = patchRules!.Value.Deserialize<Dictionary<string, RoundConfig>>(JsonApi.Options);
            AssertRoundRules(rounds, rules);
        }

        // Apply the patch.
        if (obj.TryGetProperty("name", out var nameEl) && nameEl.ValueKind == JsonValueKind.String)
        {
            existing.Name = nameEl.GetString()!;
            existing.Slug = await UniqueSlugAsync(db, existing.Name, id);
        }
        if (obj.TryGetProperty("visibility", out var visEl) && visEl.ValueKind != JsonValueKind.Null)
            existing.Visibility = visEl.GetString() == "PRIVATE" ? Visibility.PRIVATE : Visibility.PUBLIC;
        if (stagesElExists(obj, out var stages)) existing.Stages = JsonDefaults.Serialize(stages!);
        if (obj.TryGetProperty("rounds", out var roundsP) && roundsP.ValueKind != JsonValueKind.Null)
            existing.Rounds = roundsP.Clone();
        if (obj.TryGetProperty("format", out var formatEl) && formatEl.ValueKind != JsonValueKind.Null)
            existing.Format = formatEl.Clone();
        if (patchRules is not null) existing.RoundRules = patchRules.Value.Clone();
        var current = Validate.OptionalBool(obj, "current");
        if (current is not null) existing.Current = current.Value;
        existing.UpdatedAt = DateTime.UtcNow;

        if (current == true)
        {
            var others = await db.Tournaments
                .Where(t => t.OwnerId == existing.OwnerId && t.Current && t.Id != id)
                .ToListAsync();
            foreach (var t in others) t.Current = false;
        }

        db.Tournaments.Update(existing);
        await db.SaveChangesAsync();
        return existing;
    }

    private static bool stagesElExists(JsonElement obj, out List<Stage>? stages)
    {
        stages = null;
        if (!obj.TryGetProperty("stages", out var el) || el.ValueKind == JsonValueKind.Null) return false;
        stages = el.Deserialize<List<Stage>>(JsonApi.Options);
        return true;
    }

    private static bool JsonElementEquals(JsonElement a, JsonElement? b)
    {
        var aNull = a.ValueKind is JsonValueKind.Undefined or JsonValueKind.Null;
        var bNull = b is null || b.Value.ValueKind is JsonValueKind.Undefined or JsonValueKind.Null;
        if (aNull || bNull) return aNull && bNull;
        return a.GetRawText() == b!.Value.GetRawText();
    }

    private async Task<bool> HasAssembledMatchAsync(Guid tournamentId)
        => await db.Matches.AnyAsync(m => m.TournamentId == tournamentId && m.DeletedAt == null);

    public async Task<TournamentEntity> DeleteTournamentAsync(string tournamentId)
    {
        var id = Guid.Parse(tournamentId);
        var row = await db.Tournaments
            .FirstOrDefaultAsync(t => t.Id == id && t.DeletedAt == null);
        if (row is null)
            throw new TournamentError(TournamentErrorCode.NOT_FOUND, $"tournament {tournamentId} not found");
        row.DeletedAt = DateTime.UtcNow;
        row.UpdatedAt = DateTime.UtcNow;
        row.Current = false;
        await db.SaveChangesAsync();
        return row;
    }
}
