using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.RateLimiting;
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

        // POST /portal/tournaments/:tournamentId/players/by-email
        app.MapPost("/portal/tournaments/{tournamentId}/players/by-email", async (HttpContext http) =>
        {
            var tournamentId = Validate.RouteUuid(http, "tournamentId");
            await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
            await TournamentGuards.AssertWriteAsync(http, tournamentId);

            var body = Validate.Object(await Validate.ReadJsonBodyAsync(http));
            var email = Validate.RequiredString(body, "email", maxLength: 255);

            var service = http.RequestServices.GetRequiredService<RosterService>();
            var enrolled = await service.EnrollByEmailAsync(tournamentId, email);

            await AuditAsync(http, "tournament_updated", new Dictionary<string, object?>
            {
                ["tournamentId"] = tournamentId,
                ["enrolled"] = enrolled.UserId,
                ["byEmail"] = enrolled.Email
            });

            return Results.Json(enrolled, JsonApi.Options);
        });

        // PATCH /portal/tournaments/:tournamentId/players/:userId
        app.MapPatch("/portal/tournaments/{tournamentId}/players/{userId}", async (HttpContext http) =>
        {
            var tournamentId = Validate.RouteUuid(http, "tournamentId");
            var userId = Validate.RouteUuid(http, "userId");
            await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
            await TournamentGuards.AssertWriteAsync(http, tournamentId);

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
            var (displayName, _) = await service.UpdateContestantAsync(tournamentId, userId, edit);

            await AuditAsync(http, "tournament_updated", new Dictionary<string, object?>
            {
                ["tournamentId"] = tournamentId,
                ["contestantId"] = userId,
                ["displayName"] = displayName
            });

            var rows = await service.ListEnrolledAsync(tournamentId);
            var row = rows.First(r => r.UserId == userId);
            return Results.Json(new
            {
                userId = row.UserId,
                displayName = row.DisplayName,
                email = row.Email
            }, JsonApi.Options);
        });

        // POST /portal/tournaments/:tournamentId/players/new
        app.MapPost("/portal/tournaments/{tournamentId}/players/new", async (HttpContext http) =>
        {
            var tournamentId = Validate.RouteUuid(http, "tournamentId");
            await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
            await TournamentGuards.AssertWriteAsync(http, tournamentId);

            var body = Validate.Object(await Validate.ReadJsonBodyAsync(http));
            var displayName = Validate.RequiredString(body, "displayName", minLength: 1, maxLength: 100);
            var password = Validate.RequiredString(body, "password", minLength: 8, maxLength: 256);
            var email = Validate.OptionalString(body, "email", maxLength: 255);

            string? discordId = null;
            if (body.TryGetProperty("discordId", out var dc) && dc.ValueKind == JsonValueKind.String)
            {
                discordId = dc.GetString()!.Trim();
                if (discordId == "") discordId = null;
                if (discordId is not null && !DiscordPattern.IsMatch(discordId))
                    throw ApiException.BadRequest("/discordId: String does not match pattern");
            }

            var service = http.RequestServices.GetRequiredService<RosterService>();
            var contestant = await service.CreateContestantAsync(tournamentId, displayName, password, email, discordId);

            await AuditAsync(http, "tournament_updated", new Dictionary<string, object?>
            {
                ["tournamentId"] = tournamentId,
                ["contestantId"] = contestant.UserId,
                ["displayName"] = contestant.DisplayName,
                ["username"] = contestant.Username
            });

            return Results.Json(contestant, JsonApi.Options);
        });

        // POST /portal/tournaments/:tournamentId/players/:userId/password
        app.MapPost("/portal/tournaments/{tournamentId}/players/{userId}/password", async (HttpContext http) =>
        {
            var tournamentId = Validate.RouteUuid(http, "tournamentId");
            var userId = Validate.RouteUuid(http, "userId");
            await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
            await TournamentGuards.AssertWriteAsync(http, tournamentId);

            var body = Validate.Object(await Validate.ReadJsonBodyAsync(http));
            var password = Validate.RequiredString(body, "password", minLength: 8, maxLength: 256);

            var service = http.RequestServices.GetRequiredService<RosterService>();
            var reset = await service.ResetPasswordAsync(tournamentId, userId, password);

            await AuditAsync(http, "tournament_updated", new Dictionary<string, object?>
            {
                ["tournamentId"] = tournamentId,
                ["passwordResetFor"] = userId
            }, targetId: Guid.Parse(userId));

            return Results.Json(reset, JsonApi.Options);
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
