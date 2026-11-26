using System.Text.Json;
using System.Text.RegularExpressions;
using AOC.Api.Http;
using AOC.Api.Modules.Tournaments;
using AOC.Api.Shared;
using AOC.Domain.Contracts;
using AOC.Infrastructure.Audit;
using AOC.Infrastructure.Configuration;

namespace AOC.Api.Modules.Roster;

public static class RosterRoutes
{
    private static readonly Regex DiscordPattern = new("^[0-9]{15,30}$", RegexOptions.Compiled);

    public static IEndpointRouteBuilder MapRosterRoutes(this IEndpointRouteBuilder app)
    {
        app.MapGet("/portal/players", async (HttpContext http) =>
        {
            await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
            var service = http.RequestServices.GetRequiredService<RosterService>();
            var items = await service.ListPlayersAsync();
            return Results.Json(new { items }, JsonApi.Options);
        });

        app.MapPatch("/portal/players/{userId}", async (HttpContext http) =>
        {
            var userId = Validate.RouteUuid(http, "userId");
            await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");

            var edit = Validate.Object(await Validate.ReadJsonBodyAsync(http));
            var details = new List<string>();
            if (edit.TryGetProperty("displayName", out var dn))
            {
                if (dn.ValueKind != JsonValueKind.String || dn.GetString()!.Length is < 1 or > 100)
                    details.Add("/displayName: String must have at least 1 characters");
            }
            if (edit.TryGetProperty("email", out var em)
                && em.ValueKind == JsonValueKind.String && em.GetString()!.Length > 255)
                details.Add("/email: String must have at most 255 characters");
            if (edit.TryGetProperty("discordId", out var dc)
                && dc.ValueKind == JsonValueKind.String && !DiscordPattern.IsMatch(dc.GetString()!))
                details.Add("/discordId: String does not match pattern");
            if (details.Count > 0) throw ApiException.BadRequest(details[0]);
            if (edit.EnumerateObject().Count() == 0)
                throw ApiException.BadRequest("body must have at least 1 properties");

            var service = http.RequestServices.GetRequiredService<RosterService>();
            var (displayName, email) = await service.UpdatePlayerAsync(userId, edit);

            var audit = http.RequestServices.GetRequiredService<AuditService>();
            await audit.AuditAsync(http, AuditTarget.User(Guid.Parse(userId)), "player_updated",
                new PlayerUpdatedAudit(userId, displayName));

            return Results.Json(new { userId, displayName, email }, JsonApi.Options);
        });

        app.MapPost("/portal/tournaments/{tournamentId}/players", async (HttpContext http) =>
        {
            var tournamentId = Validate.RouteUuid(http, "tournamentId");
            var user = await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
            await TournamentAccess.RequireWriteAsync(http, tournamentId);

            var body = Validate.Object(await Validate.ReadJsonBodyAsync(http));
            var userIds = new List<Guid>();
            foreach (var element in Validate.RequiredArray(body, "userIds", minItems: 1))
            {
                var raw = element.GetString();
                if (raw is null || !Guid.TryParse(raw, out var parsed))
                {
                    throw ApiException.BadRequest("userIds must contain uuids");
                }
                userIds.Add(parsed);
            }

            var service = http.RequestServices.GetRequiredService<RosterService>();
            var enrolled = await service.EnrollPlayersAsync(Guid.Parse(tournamentId), userIds);

            var audit = http.RequestServices.GetRequiredService<AuditService>();
            await audit.AuditAsync(http, AuditTarget.None, "player_enrolled",
                new PlayerEnrolledAudit(tournamentId, enrolled));

            return Results.Json(new { enrolled }, JsonApi.Options);
        });

        app.MapDelete("/portal/tournaments/{tournamentId}/players/{userId}", async (HttpContext http) =>
        {
            var tournamentId = Validate.RouteUuid(http, "tournamentId");
            var userId = Validate.RouteUuid(http, "userId");
            await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
            await TournamentAccess.RequireWriteAsync(http, tournamentId);

            var service = http.RequestServices.GetRequiredService<RosterService>();
            await service.RemoveContestantAsync(tournamentId, userId);

            var audit = http.RequestServices.GetRequiredService<AuditService>();
            await audit.AuditAsync(http, AuditTarget.None, "player_removed",
                new PlayerRemovedAudit(tournamentId, userId));

            return Results.Json(new { removed = userId }, JsonApi.Options);
        });

        app.MapPatch("/portal/tournaments/{tournamentId}/players/{userId}/group", async (HttpContext http) =>
        {
            var tournamentId = Validate.RouteUuid(http, "tournamentId");
            var userId = Validate.RouteUuid(http, "userId");
            await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
            await TournamentAccess.RequireWriteAsync(http, tournamentId);

            var body = Validate.Object(await Validate.ReadJsonBodyAsync(http));
            PlayerGroup? group;
            if (!body.TryGetProperty("group", out var g))
                throw ApiException.BadRequest("body must have required property 'group'");
            group = g.ValueKind switch
            {
                JsonValueKind.Null => null,
                JsonValueKind.String when g.GetString() == "A" => PlayerGroup.A,
                JsonValueKind.String when g.GetString() == "B" => PlayerGroup.B,
                _ => throw ApiException.BadRequest("/group: Expected enum value")
            };

            var service = http.RequestServices.GetRequiredService<RosterService>();
            var placed = await service.AssignGroupAsync(tournamentId, userId, group);
            if (!placed)
            {
                http.Response.StatusCode = 404;
                return Results.Json(new
                {
                    code = "NOT_ENROLLED",
                    message = "this player is not enrolled in the tournament"
                }, JsonApi.Options);
            }

            var audit = http.RequestServices.GetRequiredService<AuditService>();
            await audit.AuditAsync(http, AuditTarget.None, "group_assigned",
                new GroupAssignedAudit(tournamentId, userId, group?.ToString()));

            return Results.Json(new { userId, group }, JsonApi.Options);
        });

        app.MapGet("/portal/tournaments/{tournamentId}/players", async (HttpContext http) =>
        {
            var tournamentId = Validate.RouteUuid(http, "tournamentId");
            await TournamentAccess.RequireViewAsync(http, tournamentId);
            var service = http.RequestServices.GetRequiredService<RosterService>();
            var items = await service.ListEnrolledAsync(tournamentId);
            return Results.Json(new { items }, JsonApi.Options);
        });

        return app;
    }

    private sealed record PlayerUpdatedAudit(string PlayerId, string DisplayName);

    private sealed record PlayerEnrolledAudit(string TournamentId, int Enrolled);

    private sealed record PlayerRemovedAudit(string TournamentId, string RemovedContestant);

    private sealed record GroupAssignedAudit(string TournamentId, string UserId, string? Group);
}
