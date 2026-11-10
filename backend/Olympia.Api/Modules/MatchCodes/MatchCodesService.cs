using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Olympia.Api.Modules.Matches;
using Olympia.Api.Http;
using Olympia.Api.Modules.Tournaments;
using Olympia.Api.Shared;
using Olympia.Domain.Contracts;
using Olympia.Infrastructure.Configuration;
using Olympia.Infrastructure.Data;
using Olympia.Infrastructure.Data.Entities;

namespace Olympia.Api.Modules.MatchCodes;

/// <summary>Port of match-codes/service.ts.</summary>
public sealed class MatchCodesService(OlympiaDbContext db)
{
    private const int RoomCodeTtlMs = 24 * 60 * 60 * 1000;
    private const string Alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    private const int CodeLength = 6;
    private const int MaxMintTries = 5;

    private static string NormalizeCode(string raw) => raw.Trim().ToUpperInvariant();

    private static string RandomCode()
    {
        var chars = new char[CodeLength];
        for (var i = 0; i < CodeLength; i++)
            chars[i] = Alphabet[Random.Shared.Next(Alphabet.Length)];
        return new string(chars);
    }

    private static bool IsUniqueViolation(DbUpdateException ex)
        => ex.InnerException is PostgresException { SqlState: "23505" };

    private async Task<MatchCodeEntity> InsertCodeAsync(Guid matchId, Guid createdBy)
    {
        for (var attempt = 0; attempt < MaxMintTries; attempt++)
        {
            try
            {
                var row = new MatchCodeEntity
                {
                    MatchId = matchId,
                    Code = RandomCode(),
                    ExpiresAt = DateTime.UtcNow.AddMilliseconds(RoomCodeTtlMs),
                    CreatedBy = createdBy
                };
                db.MatchCodes.Add(row);
                await db.SaveChangesAsync();
                return row;
            }
            catch (DbUpdateException error) when (IsUniqueViolation(error) && attempt < MaxMintTries - 1)
            {
                db.ChangeTracker.Clear();
            }
        }
        throw new InvalidOperationException("could not mint a code");
    }

    public sealed record RoomCode(Guid MatchId, string Code, DateTime ExpiresAt);

    public async Task<RoomCode> RotateRoomCodeAsync(string tournamentId, string matchId, Guid createdBy)
    {
        var mid = Guid.Parse(matchId);
        var tid = Guid.Parse(tournamentId);

        var match = await db.Matches
            .FirstOrDefaultAsync(m => m.Id == mid && m.TournamentId == tid);
        if (match is null || match.DeletedAt is not null)
            throw new CodeError(CodeErrorCode.NOT_FOUND, "trận này không tồn tại");
        if (match.Status == MatchStatus.FINISHED)
            throw new CodeError(CodeErrorCode.CONFLICT, "trận đã kết thúc — không còn mã vào");

        var row = await InsertCodeAsync(mid, createdBy);

        var stale = await db.MatchCodes
            .Where(c => c.MatchId == mid && c.Id != row.Id)
            .ToListAsync();
        db.MatchCodes.RemoveRange(stale);
        await db.SaveChangesAsync();

        return new RoomCode(row.MatchId, row.Code, row.ExpiresAt);
    }

    public async Task<List<RoomCode>> ActiveRoomCodesAsync(string tournamentId)
    {
        var tid = Guid.Parse(tournamentId);
        var now = DateTime.UtcNow;
        return await (
            from c in db.MatchCodes.AsNoTracking()
            join m in db.Matches.AsNoTracking() on c.MatchId equals m.Id
            where m.TournamentId == tid && m.DeletedAt == null
                  && m.Status != MatchStatus.FINISHED && c.ExpiresAt > now
            select new RoomCode(m.Id, c.Code, c.ExpiresAt)
        ).ToListAsync();
    }

    public sealed record ClaimResult(Guid MatchId, string Slug, string Label);

    public async Task<ClaimResult> ClaimSeatAsync(string userId, string rawCode)
    {
        var code = NormalizeCode(rawCode);
        var now = DateTime.UtcNow;

        var codeRow = await db.MatchCodes.AsNoTracking()
            .FirstOrDefaultAsync(c => c.Code == code && c.ExpiresAt > now);
        if (codeRow is null)
            throw new CodeError(CodeErrorCode.NOT_FOUND,
                "Mã không đúng hoặc đã hết hạn — xin hỏi lại ban điều hành.");
        var matchId = codeRow.MatchId;

        var match = await db.Matches.AsNoTracking().FirstOrDefaultAsync(m => m.Id == matchId);
        if (match is null || match.DeletedAt is not null)
            throw new CodeError(CodeErrorCode.NOT_FOUND,
                "Mã không đúng hoặc đã hết hạn — xin hỏi lại ban điều hành.");
        if (match.Status == MatchStatus.FINISHED)
            throw new CodeError(CodeErrorCode.CONFLICT, "Trận này đã kết thúc.");

        var tournament = await db.Tournaments.AsNoTracking()
            .FirstOrDefaultAsync(t => t.Id == match.TournamentId);
        if (tournament is null)
            throw new CodeError(CodeErrorCode.NOT_FOUND,
                "Mã không đúng hoặc đã hết hạn — xin hỏi lại ban điều hành.");

        var capacity = tournament.FormatValue.AllowedSeatCounts().Max();

        // Lock the seat row for the capacity check (SELECT ... FOR UPDATE).
        var locked = await db.Matches.FirstAsync(m => m.Id == matchId);
        if (locked.DeletedAt is not null)
            throw new CodeError(CodeErrorCode.NOT_FOUND,
                "Mã không đúng hoặc đã hết hạn — xin hỏi lại ban điều hành.");
        if (locked.Status == MatchStatus.FINISHED)
            throw new CodeError(CodeErrorCode.CONFLICT, "Trận này đã kết thúc.");

        var seats = locked.PlayersList;
        var uid = Guid.Parse(userId);
        if (MatchSeats.IsSeatedInMatch(seats, uid))
            return new ClaimResult(matchId, tournament.Slug, match.Label);

        if (seats.Count >= capacity)
            throw new CodeError(CodeErrorCode.CONFLICT,
                "Trận này đã đủ thí sinh — liên hệ ban điều hành nếu bạn cho là sai.");

        var seed = seats.Count == 0 ? 1 : seats.Max(s => s.Seed) + 1;
        var next = seats.Append(new Seat { Kind = "user", UserId = userId, Seed = seed }).ToList();

        locked.Players = JsonDefaults.Serialize(next);
        locked.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        return new ClaimResult(matchId, tournament.Slug, match.Label);
    }
}

/// <summary>Port of match-codes/routes.ts.</summary>
public static class MatchCodeRoutes
{
    public static IEndpointRouteBuilder MapMatchCodeRoutes(this IEndpointRouteBuilder app)
    {
        // POST /gameplay/join/claim
        app.MapPost("/gameplay/join/claim", async (HttpContext http) =>
        {
            var user = await http.RequireAuthAsync(Surface.GAMEPLAY);
            var body = Validate.Object(await Validate.ReadJsonBodyAsync(http));
            var code = Validate.RequiredString(body, "code", minLength: 1, maxLength: 32);

            var service = http.RequestServices.GetRequiredService<MatchCodesService>();
            var result = await service.ClaimSeatAsync(user.Id.ToString(), code);

            var audit = http.RequestServices.GetRequiredService<Olympia.Infrastructure.Audit.AuditService>();
            await audit.AuditAsync(new Olympia.Infrastructure.Audit.AuditEvent
            {
                Action = "tournament_updated",
                ActorId = user.Id,
                MatchId = result.MatchId,
                Ip = http.Connection.RemoteIpAddress?.ToString(),
                UserAgent = http.Request.Headers.UserAgent.ToString(),
                Details = new Dictionary<string, object?> { ["seatClaimed"] = user.Id }
            });

            return Results.Json(result, JsonApi.Options);
        }).RequireRateLimiting("strict10").DisableAntiforgery();

        // GET /portal/tournaments/:tournamentId/match-codes
        app.MapGet("/portal/tournaments/{tournamentId}/match-codes", async (HttpContext http) =>
        {
            var tournamentId = Validate.RouteUuid(http, "tournamentId");
            await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
            await TournamentGuards.AssertWriteAsync(http, tournamentId);

            var service = http.RequestServices.GetRequiredService<MatchCodesService>();
            var items = await service.ActiveRoomCodesAsync(tournamentId);
            return Results.Json(new { items }, JsonApi.Options);
        });

        // POST /portal/tournaments/:tournamentId/matches/:matchId/code
        app.MapPost("/portal/tournaments/{tournamentId}/matches/{matchId}/code", async (HttpContext http) =>
        {
            var tournamentId = Validate.RouteUuid(http, "tournamentId");
            var matchId = Validate.RouteUuid(http, "matchId");
            var user = await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
            await TournamentGuards.AssertWriteAsync(http, tournamentId);

            var service = http.RequestServices.GetRequiredService<MatchCodesService>();
            var room = await service.RotateRoomCodeAsync(tournamentId, matchId, user.Id);

            var audit = http.RequestServices.GetRequiredService<Olympia.Infrastructure.Audit.AuditService>();
            await audit.AuditAsync(new Olympia.Infrastructure.Audit.AuditEvent
            {
                Action = "tournament_updated",
                ActorId = user.Id,
                MatchId = Guid.Parse(matchId),
                Ip = http.Connection.RemoteIpAddress?.ToString(),
                UserAgent = http.Request.Headers.UserAgent.ToString(),
                Details = new Dictionary<string, object?>
                {
                    ["tournamentId"] = tournamentId,
                    ["roomCodeRotated"] = matchId,
                    ["expiresAt"] = room.ExpiresAt
                }
            });

            return Results.Json(room, JsonApi.Options);
        });

        return app;
    }
}
