using System.Text.Json;
using System.Text.RegularExpressions;
using AOC.Api.Http;
using AOC.Api.Modules.Tournaments;
using AOC.Infrastructure.Configuration;

namespace AOC.Api.Modules.Roster;

/// <summary>Port of roster/routes.ts.</summary>
public static class RosterRoutes
{
    private static readonly Regex DiscordPattern = new("^[0-9]{15,30}$", RegexOptions.Compiled);

    public static IEndpointRouteBuilder MapRosterRoutes(this IEndpointRouteBuilder app)
    {
        // GET /portal/players — every player account, and which tournaments each
        // one is in. Players arrive here by signing in with Google; the desk
        // assigns tournaments afterwards.
        app.MapGet("/portal/players", async (HttpContext http) =>
        {
            await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
            var service = http.RequestServices.GetRequiredService<RosterService>();
            var items = await service.ListPlayersAsync();
            return Results.Json(new { items }, JsonApi.Options);
        });

        // PATCH /portal/players/:userId — the account itself (name / email /
        // Discord), independent of any tournament.
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

            await AuditAsync(http, "player_updated", new Dictionary<string, object?>
            {
                ["playerId"] = userId,
                ["displayName"] = displayName
            }, targetId: Guid.Parse(userId));

            return Results.Json(new { userId, displayName, email }, JsonApi.Options);
        });

        // POST /portal/tournaments/:tournamentId/players
        app.MapPost("/portal/tournaments/{tournamentId}/players", async (HttpContext http) =>
        {
            var tournamentId = Validate.RouteUuid(http, "tournamentId");
            var user = await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
            await TournamentGuards.AssertWriteAsync(http, tournamentId);

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

            await AuditAsync(http, "tournament_updated", new Dictionary<string, object?>
            {
                ["tournamentId"] = tournamentId,
                ["enrolled"] = enrolled
            });

            return Results.Json(new { enrolled }, JsonApi.Options);
        });

        // DELETE /portal/tournaments/:tournamentId/players/:userId
        app.MapDelete("/portal/tournaments/{tournamentId}/players/{userId}", async (HttpContext http) =>
        {
            var tournamentId = Validate.RouteUuid(http, "tournamentId");
            var userId = Validate.RouteUuid(http, "userId");
            await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
            await TournamentGuards.AssertWriteAsync(http, tournamentId);

            var service = http.RequestServices.GetRequiredService<RosterService>();
            await service.RemoveContestantAsync(tournamentId, userId);

            await AuditAsync(http, "tournament_updated", new Dictionary<string, object?>
            {
                ["tournamentId"] = tournamentId,
                ["removedContestant"] = userId
            });

            return Results.Json(new { removed = userId }, JsonApi.Options);
        });

        // PATCH /portal/tournaments/:tournamentId/players/:userId/group
        app.MapPatch("/portal/tournaments/{tournamentId}/players/{userId}/group", async (HttpContext http) =>
        {
            var tournamentId = Validate.RouteUuid(http, "tournamentId");
            var userId = Validate.RouteUuid(http, "userId");
            await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
            await TournamentGuards.AssertWriteAsync(http, tournamentId);

            var body = Validate.Object(await Validate.ReadJsonBodyAsync(http));
            GroupLabel? group;
            if (!body.TryGetProperty("group", out var g))
                throw ApiException.BadRequest("body must have required property 'group'");
            group = g.ValueKind switch
            {
                JsonValueKind.Null => null,
                JsonValueKind.String when g.GetString() == "A" => GroupLabel.A,
                JsonValueKind.String when g.GetString() == "B" => GroupLabel.B,
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

            await AuditAsync(http, "tournament_updated", new Dictionary<string, object?>
            {
                ["tournamentId"] = tournamentId,
                ["userId"] = userId,
                ["group"] = group?.ToString()
            });

            return Results.Json(new { userId, group }, JsonApi.Options);
        });

        // GET /portal/tournaments/:tournamentId/players
        app.MapGet("/portal/tournaments/{tournamentId}/players", async (HttpContext http) =>
        {
            var tournamentId = Validate.RouteUuid(http, "tournamentId");
            await TournamentGuards.AssertViewAsync(http, tournamentId);
            var service = http.RequestServices.GetRequiredService<RosterService>();
            var items = await service.ListEnrolledAsync(tournamentId);
            return Results.Json(new { items }, JsonApi.Options);
        });

        return app;
    }

    private static Task AuditAsync(HttpContext http, string action,
        Dictionary<string, object?> details, Guid? targetId = null)
    {
        var user = http.Items.TryGetValue(Guards.SessionUserKey, out var u)
            ? u as Infrastructure.Data.Entities.UserEntity
            : null;
        var audit = http.RequestServices.GetRequiredService<AOC.Infrastructure.Audit.AuditService>();
        return audit.AuditAsync(new AOC.Infrastructure.Audit.AuditEvent
        {
            Action = action,
            ActorId = user?.Id,
            TargetId = targetId,
            Details = details,
            Ip = http.Connection.RemoteIpAddress?.ToString(),
            UserAgent = http.Request.Headers.UserAgent.ToString()
        });
    }
}
