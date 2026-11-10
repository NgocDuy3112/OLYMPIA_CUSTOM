using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Olympia.Api.Http;
using Olympia.Api.Modules.Matches;
using Olympia.Api.Modules.Standings;
using Olympia.Api.Modules.Tournaments;
using StandingsBuilder = Olympia.Domain.Engine.Scoring.Standings;
using Olympia.Domain.Contracts;
using Olympia.Infrastructure.Data;
using Olympia.Infrastructure.Data.Entities;

namespace Olympia.Api.Modules.GameplayRead;

/// <summary>Port of gameplay-read/present.ts.</summary>
public static class Present
{
    public static (string? Start, string? End) StageRange(IReadOnlyList<Stage> stages)
    {
        string? start = null, end = null;
        foreach (var stage in stages)
        {
            if (!string.IsNullOrEmpty(stage.Start) && (start is null || string.CompareOrdinal(stage.Start, start) < 0))
                start = stage.Start;
            if (!string.IsNullOrEmpty(stage.End) && (end is null || string.CompareOrdinal(stage.End, end) > 0))
                end = stage.End;
        }
        return (start, end);
    }

    public static object Tournament(TournamentEntity row, int places)
    {
        var (start, end) = StageRange(row.StagesList);
        return new
        {
            id = row.Id,
            slug = row.Slug,
            name = row.Name,
            current = row.Current,
            createdAt = row.CreatedAt,
            closedAt = row.ClosedAt,
            start,
            end,
            rounds = row.RoundsList,
            format = row.FormatValue,
            stages = row.StagesList,
            places
        };
    }

    public static object TournamentSummary(TournamentEntity row)
    {
        var (start, end) = StageRange(row.StagesList);
        return new
        {
            id = row.Id,
            slug = row.Slug,
            name = row.Name,
            current = row.Current,
            createdAt = row.CreatedAt,
            start,
            end
        };
    }

    public static string MatchRound(MatchEntity row, IReadOnlyDictionary<string, string> stageTitles)
    {
        var title = stageTitles.GetValueOrDefault(row.StageId, row.StageId);
        return $"{title} · {row.Label}";
    }

    public static object Match(
        MatchEntity row,
        IReadOnlyDictionary<string, string> stageTitles,
        IReadOnlyDictionary<string, string> names,
        List<ResultEntry>? results)
    {
        var players = row.PlayersList.Select(seat => new
        {
            id = seat.UserId,
            name = names.GetValueOrDefault(seat.UserId, "Unknown"),
            seed = seat.Seed
        }).ToList();

        object Base() => new
        {
            id = row.Id,
            stageId = row.StageId,
            slot = row.Slot,
            status = row.Status.ToString(),
            scheduledAt = row.ScheduledAt,
            round = MatchRound(row, stageTitles),
            players
        };

        if (results is null) return Base();

        var publicResults = results.Select(entry => new
        {
            id = entry.UserId,
            name = names.GetValueOrDefault(entry.UserId, "Unknown"),
            totalScore = entry.TotalScore,
            rank = entry.Rank,
            roundScores = entry.RoundScores
        }).ToList();

        return new
        {
            id = row.Id,
            stageId = row.StageId,
            slot = row.Slot,
            status = row.Status.ToString(),
            scheduledAt = row.ScheduledAt,
            round = MatchRound(row, stageTitles),
            players,
            results = publicResults
        };
    }

    public static object Standing(StandingsBuilder.PlayerStanding row) => new
    {
        userId = row.UserId,
        displayName = row.DisplayName,
        place = row.Place,
        matchesPlayed = row.MatchesPlayed,
        stageId = row.StageId,
        stageTitle = row.StageTitle,
        slot = row.Slot
    };
}

/// <summary>Port of gameplay-read/service.ts.</summary>
public sealed class GameplayReadService(OlympiaDbContext db, MatchesService matches, StandingsService standings)
{
    public async Task<TournamentEntity> RequirePublicTournamentBySlugAsync(string slug)
    {
        var row = await db.Tournaments.AsNoTracking().FirstOrDefaultAsync(t =>
            t.Slug == slug && t.Visibility == Visibility.PUBLIC && t.DeletedAt == null);
        if (row is null)
            throw new TournamentError(TournamentErrorCode.NOT_FOUND, $"tournament {slug} not found");
        return row;
    }

    public async Task<object> PublicTournamentAsync(string slug)
    {
        var row = await RequirePublicTournamentBySlugAsync(slug);
        var places = await db.TournamentPlayers.CountAsync(p => p.TournamentId == row.Id);
        return Present.Tournament(row, places);
    }

    public async Task<List<object>> ListPublicTournamentsAsync()
    {
        var rows = await db.Tournaments.AsNoTracking()
            .Where(t => t.Visibility == Visibility.PUBLIC && t.DeletedAt == null)
            .OrderBy(t => t.CreatedAt)
            .ToListAsync();
        return rows.Select(r => (object)Present.TournamentSummary(r)).ToList();
    }

    public async Task<PageResult<object>> PublicScheduleAsync(string slug, Page page)
    {
        var tournament = await RequirePublicTournamentBySlugAsync(slug);
        var listed = await matches.ListMatchesAsync(tournament.Id.ToString(), null, page);

        var finishedIds = listed.Items
            .Where(row => row.Status == MatchStatus.FINISHED)
            .Select(row => row.Id)
            .ToList();

        var resultsByMatch = await ResultEntriesOfAsync(finishedIds);

        var ids = new HashSet<string>();
        foreach (var row in listed.Items)
            foreach (var seat in row.PlayersList)
                ids.Add(seat.UserId);
        foreach (var entries in resultsByMatch.Values)
            foreach (var entry in entries)
                ids.Add(entry.UserId);

        var names = await standings.NamesOfAsync(ids);
        var stageTitles = tournament.StagesList.ToDictionary(s => s.Id, s => s.Title);

        var items = listed.Items
            .Select(row => Present.Match(row, stageTitles, names,
                resultsByMatch.TryGetValue(row.Id, out var entries) ? entries : null))
            .ToList();

        return new PageResult<object>(items, listed.Total, listed.Limit, listed.Offset);
    }

    private async Task<Dictionary<Guid, List<ResultEntry>>> ResultEntriesOfAsync(List<Guid> matchIds)
    {
        var byMatch = new Dictionary<Guid, List<ResultEntry>>();
        if (matchIds.Count == 0) return byMatch;

        var rows = await db.MatchResults.AsNoTracking()
            .Where(r => matchIds.Contains(r.MatchId))
            .Select(r => new { r.MatchId, r.Results })
            .ToListAsync();

        foreach (var row in rows)
            byMatch[row.MatchId] = JsonDefaults.Deserialize<List<ResultEntry>>(row.Results) ?? [];
        return byMatch;
    }

    public async Task<object> PublicStandingsAsync(string slug)
    {
        var tournament = await RequirePublicTournamentBySlugAsync(slug);
        var rows = await standings.GetStandingsAsync(tournament.Id.ToString());
        return new { rows = rows.Select(Present.Standing).ToList() };
    }
}

/// <summary>Port of gameplay-read/routes.ts.</summary>
public static class GameplayReadRoutes
{
    public static IEndpointRouteBuilder MapGameplayReadRoutes(this IEndpointRouteBuilder app)
    {
        app.MapGet("/gameplay/tournaments", async (HttpContext http) =>
        {
            var service = http.RequestServices.GetRequiredService<GameplayReadService>();
            return Results.Json(new { tournaments = await service.ListPublicTournamentsAsync() },
                JsonApi.Options);
        }).RequireRateLimiting("public120");

        app.MapGet("/gameplay/tournaments/{slug}", async (HttpContext http) =>
        {
            var slug = Validate.RouteString(http, "slug");
            if (!Regex.IsMatch(slug, "^[a-z0-9-]{1,100}$"))
                throw ApiException.BadRequest("slug must match pattern");
            var service = http.RequestServices.GetRequiredService<GameplayReadService>();
            return Results.Json(await service.PublicTournamentAsync(slug), JsonApi.Options);
        }).RequireRateLimiting("public120");

        app.MapGet("/gameplay/tournaments/{slug}/matches", async (HttpContext http) =>
        {
            var slug = Validate.RouteString(http, "slug");
            if (!Regex.IsMatch(slug, "^[a-z0-9-]{1,100}$"))
                throw ApiException.BadRequest("slug must match pattern");
            var service = http.RequestServices.GetRequiredService<GameplayReadService>();
            var page = Pagination.ParsePage(Validate.Query(http));
            return Results.Json(await service.PublicScheduleAsync(slug, page), JsonApi.Options);
        }).RequireRateLimiting("public120");

        app.MapGet("/gameplay/tournaments/{slug}/standings", async (HttpContext http) =>
        {
            var slug = Validate.RouteString(http, "slug");
            if (!Regex.IsMatch(slug, "^[a-z0-9-]{1,100}$"))
                throw ApiException.BadRequest("slug must match pattern");
            var service = http.RequestServices.GetRequiredService<GameplayReadService>();
            return Results.Json(await service.PublicStandingsAsync(slug), JsonApi.Options);
        }).RequireRateLimiting("public120");

        return app;
    }
}
