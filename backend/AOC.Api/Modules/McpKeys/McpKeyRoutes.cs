using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.RateLimiting;
using AOC.Api.Http;
using AOC.Api.Modules.Mcp;
using AOC.Api.Shared;
using AOC.Infrastructure.Audit;
using AOC.Infrastructure.Configuration;
using AOC.Infrastructure.Data;
using AOC.Infrastructure.Data.Entities;

namespace AOC.Api.Modules.McpKeys;

public static class McpKeyRoutes
{
    private static readonly Regex ScopePattern = new("^(READ|WRITE|ANNOUNCE)$", RegexOptions.Compiled);

    public static IEndpointRouteBuilder MapMcpKeyRoutes(this IEndpointRouteBuilder app)
    {
        app.MapPost("/portal/mcp-keys", async (HttpContext http) =>
        {
            var user = await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
            var body = Validate.Object(await Validate.ReadJsonBodyAsync(http));
            var label = Validate.RequiredString(body, "label", minLength: 1, maxLength: 100);

            List<string>? scopes = null;
            if (body.TryGetProperty("scopes", out var sc) && sc.ValueKind != JsonValueKind.Null)
            {
                if (sc.ValueKind != JsonValueKind.Array || sc.GetArrayLength() < 1)
                    throw ApiException.BadRequest("/scopes: Array must have at least 1 items");
                scopes = sc.EnumerateArray().Select(s => s.GetString() ?? "").ToList();
                if (scopes.Any(x => !ScopePattern.IsMatch(x)))
                    throw ApiException.BadRequest("/scopes: Expected enum value");
            }

            DateTime? expiresAt = null;
            if (body.TryGetProperty("expiresAt", out var ex))
            {
                if (ex.ValueKind == JsonValueKind.Null) expiresAt = null;
                else if (ex.ValueKind == JsonValueKind.String
                         && DateTime.TryParse(ex.GetString(), null,
                             System.Globalization.DateTimeStyles.AdjustToUniversal
                             | System.Globalization.DateTimeStyles.AssumeUniversal, out var parsed))
                    expiresAt = parsed;
                else
                    throw ApiException.BadRequest("/expiresAt: Expected string with format 'date-time'");
            }

            var service = http.RequestServices.GetRequiredService<McpKeysService>();
            var issued = await service.CreateMcpKeyAsync(user.Id, label, scopes, expiresAt);

            var audit = http.RequestServices.GetRequiredService<AuditService>();
            await audit.AuditAsync(http, AuditTarget.User(user.Id), "mcp_key_issued",
                new McpKeyIssuedAudit(issued.Key.Id, issued.Key.Prefix, issued.Key.Label,
                    issued.Key.Scopes, issued.Key.ExpiresAt));

            http.Response.StatusCode = 201;
            return Results.Json(issued, JsonApi.Options);
        });

        app.MapGet("/portal/mcp-keys", async (HttpContext http) =>
        {
            var user = await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
            var query = Validate.Query(http);

            Guid? userId = null;
            if (user.Role == UserRole.ADMIN)
            {
                var raw = query.GetValueOrDefault("userId");
                if (raw is not null)
                {
                    if (!Guid.TryParse(raw, out var parsed))
                        throw ApiException.BadRequest("/userId: Expected string with format 'uuid'");
                    userId = parsed;
                }
            }
            else
            {
                userId = user.Id;
            }

            var service = http.RequestServices.GetRequiredService<McpKeysService>();
            return Results.Json(await service.ListMcpKeysAsync(userId, Pagination.ParsePage(query)),
                JsonApi.Options);
        });

        app.MapGet("/portal/mcp-keys/scopes", async (HttpContext http) =>
        {
            await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
            return Results.Json(new McpScopesResponse(McpToolCatalog.Scopes()), JsonApi.Options);
        });

        app.MapPost("/portal/mcp-keys/revoke", async (HttpContext http) =>
        {
            var user = await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
            var body = Validate.Object(await Validate.ReadJsonBodyAsync(http));
            var ids = Validate.RequiredArray(body, "ids", minItems: 1)
                .Select(element => Guid.TryParse(element.GetString(), out var parsed)
                    ? parsed
                    : throw ApiException.BadRequest("ids: Expected string with format 'uuid'"))
                .ToList();

            var service = http.RequestServices.GetRequiredService<McpKeysService>();
            var report = await service.RevokeMcpKeysAsync(ids,
                user.Role == UserRole.ADMIN ? null : user.Id);

            var audit = http.RequestServices.GetRequiredService<AuditService>();
            await audit.AuditAsync(http, AuditTarget.None, "mcp_key_revoked",
                new RevokedKeysAudit(report.Ids, report.Revoked));

            return Results.Json(report, JsonApi.Options);
        });

        app.MapDelete("/portal/mcp-keys/{id}", async (HttpContext http) =>
        {
            var user = await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
            var id = Validate.RouteUuid(http, "id");

            var service = http.RequestServices.GetRequiredService<McpKeysService>();
            var revoked = await service.RevokeMcpKeyAsync(Guid.Parse(id),
                user.Role == UserRole.ADMIN ? null : user.Id);

            var audit = http.RequestServices.GetRequiredService<AuditService>();
            await audit.AuditAsync(http, AuditTarget.User(revoked.UserId), "mcp_key_revoked",
                new RevokedKeyAudit(revoked.Id, revoked.Prefix, revoked.Label));

            http.Response.StatusCode = 204;
            return Results.Empty;
        });

        return app;
    }

    private sealed record McpKeyIssuedAudit(
        Guid McpKeyId, string Prefix, string Label, string[] Scopes, DateTime? ExpiresAt);

    private sealed record RevokedKeysAudit(List<Guid> McpKeyIds, int Revoked);

    private sealed record RevokedKeyAudit(Guid McpKeyId, string Prefix, string Label);
}
