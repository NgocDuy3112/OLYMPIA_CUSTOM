using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Olympia.Api.Http;
using Olympia.Api.Modules.Tournaments;
using Olympia.Api.Shared;
using Olympia.Infrastructure.Configuration;
using Olympia.Infrastructure.Data;
using Olympia.Infrastructure.Data.Entities;

namespace Olympia.Api.Modules.McpKeys;

/// <summary>Port of mcp-keys/keys.ts.</summary>
public static class McpKeyTokens
{
    private const string TokenMarker = "ocmcp";
    private const int PrefixHexBytes = 4;
    private const int SecretHexBytes = 32;

    public static string HashMcpKey(string token)
        => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token))).ToLowerInvariant();

    public static (string Prefix, int)? ParseMcpKey(string token)
    {
        var parts = token.Split('_');
        if (parts.Length != 3) return null;
        var (marker, prefix, secret) = (parts[0], parts[1], parts[2]);
        if (marker != TokenMarker) return null;
        if (prefix.Length != PrefixHexBytes * 2) return null;
        if (secret.Length != SecretHexBytes * 2) return null;
        return (prefix, 0);
    }

    public static (string Token, string Prefix, string KeyHash) GenerateMcpKey()
    {
        var prefix = Convert.ToHexString(RandomNumberGenerator.GetBytes(PrefixHexBytes)).ToLowerInvariant();
        var secret = Convert.ToHexString(RandomNumberGenerator.GetBytes(SecretHexBytes)).ToLowerInvariant();
        var token = $"{TokenMarker}_{prefix}_{secret}";
        return (token, prefix, HashMcpKey(token));
    }
}

/// <summary>Port of mcp-keys/service.ts.</summary>
public sealed class McpKeysService(OlympiaDbContext db)
{
    public sealed record PublicMcpKey(
        Guid Id,
        Guid UserId,
        string Label,
        string Prefix,
        string[] Scopes,
        DateTime? ExpiresAt,
        DateTime CreatedAt,
        DateTime LastUsedAt,
        string? LastIp,
        string? LastUserAgent,
        DateTime? RevokedAt);

    public sealed record IssuedMcpKey(string Token, PublicMcpKey Key);

    public static PublicMcpKey PublicOf(McpKeyEntity row) => new(
        row.Id, row.UserId, row.Label, row.Prefix, row.Scopes, row.ExpiresAt,
        row.CreatedAt, row.LastUsedAt, row.LastIp, row.LastUserAgent, row.RevokedAt);

    public async Task<IssuedMcpKey> CreateMcpKeyAsync(Guid userId, string label, List<string>? scopes, DateTime? expiresAt)
    {
        scopes ??= ["READ"];
        if (scopes.Distinct().Count() != scopes.Count)
            throw new McpKeyError(McpKeyErrorCode.VALIDATION, "scopes must be unique");

        var (token, prefix, keyHash) = McpKeyTokens.GenerateMcpKey();
        var row = new McpKeyEntity
        {
            UserId = userId,
            Label = label,
            Prefix = prefix,
            KeyHash = keyHash,
            Scopes = scopes.ToArray(),
            ExpiresAt = expiresAt
        };
        db.McpKeys.Add(row);
        await db.SaveChangesAsync();
        return new IssuedMcpKey(token, PublicOf(row));
    }

    public async Task<PageResult<PublicMcpKey>> ListMcpKeysAsync(Guid? userId, Page page)
    {
        var query = db.McpKeys.AsNoTracking().AsQueryable();
        if (userId is not null) query = query.Where(k => k.UserId == userId);

        var total = await query.CountAsync();
        var items = await query
            .OrderByDescending(k => k.CreatedAt)
            .ThenByDescending(k => k.Id)
            .Skip(page.Offset)
            .Take(page.Limit)
            .Select(k => new
            {
                k.Id, k.UserId, k.Label, k.Prefix, k.Scopes, k.ExpiresAt,
                k.CreatedAt, k.LastUsedAt, k.LastIp, k.LastUserAgent, k.RevokedAt
            })
            .ToListAsync();

        return Pagination.Result(items.Select(i => new PublicMcpKey(
            i.Id, i.UserId, i.Label, i.Prefix, i.Scopes, i.ExpiresAt,
            i.CreatedAt, i.LastUsedAt, i.LastIp, i.LastUserAgent, i.RevokedAt)).ToList(),
            total, page);
    }

    public async Task<PublicMcpKey> RevokeMcpKeyAsync(Guid id, Guid? onlyOwnedBy)
    {
        var query = db.McpKeys.AsQueryable();
        if (onlyOwnedBy is not null) query = query.Where(k => k.UserId == onlyOwnedBy);

        var existing = await query.AsNoTracking().FirstOrDefaultAsync(k => k.Id == id)
            ?? throw new McpKeyError(McpKeyErrorCode.NOT_FOUND, $"MCP key {id} not found");
        if (existing.RevokedAt is not null) return PublicOf(existing);

        var tracked = await db.McpKeys.FirstAsync(k => k.Id == id);
        tracked.RevokedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return PublicOf(tracked);
    }

    public sealed record VerifiedMcpKey(PublicMcpKey Key, UserEntity User);

    public async Task<VerifiedMcpKey> VerifyMcpTokenAsync(string token, string? ip = null, string? userAgent = null)
    {
        void Unauthorized(string message) => throw new McpKeyError(McpKeyErrorCode.UNAUTHORIZED, message);

        if (McpKeyTokens.ParseMcpKey(token) is null) Unauthorized("Malformed MCP key");

        var hash = McpKeyTokens.HashMcpKey(token);
        var key = await db.McpKeys.AsNoTracking().FirstOrDefaultAsync(k => k.KeyHash == hash)
            ?? Unauthorized2<McpKeyEntity>("Unknown MCP key");
        if (key.RevokedAt is not null) Unauthorized("MCP key revoked");
        if (key.ExpiresAt is { } expires && expires <= DateTime.UtcNow)
            Unauthorized("MCP key expired");

        var user = await db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == key.UserId)
            ?? Unauthorized2<UserEntity>("Account not found");
        if (user.DisabledAt is not null) Unauthorized("Account disabled");

        var tracked = await db.McpKeys.FirstAsync(k => k.Id == key.Id);
        tracked.LastUsedAt = DateTime.UtcNow;
        if (ip is not null && ip != tracked.LastIp) tracked.LastIp = ip;
        if (userAgent is not null && userAgent != tracked.LastUserAgent) tracked.LastUserAgent = userAgent;
        await db.SaveChangesAsync();

        return new VerifiedMcpKey(PublicOf(key), user);

        static T Unauthorized2<T>(string message) =>
            throw new McpKeyError(McpKeyErrorCode.UNAUTHORIZED, message);
    }
}

/// <summary>Port of mcp-keys/routes.ts.</summary>
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

            var audit = http.RequestServices.GetRequiredService<Olympia.Infrastructure.Audit.AuditService>();
            await audit.AuditAsync(new Olympia.Infrastructure.Audit.AuditEvent
            {
                Action = "mcp_key_issued",
                ActorId = user.Id,
                TargetId = user.Id,
                Ip = http.Connection.RemoteIpAddress?.ToString(),
                UserAgent = http.Request.Headers.UserAgent.ToString(),
                Details = new Dictionary<string, object?>
                {
                    ["mcpKeyId"] = issued.Key.Id,
                    ["prefix"] = issued.Key.Prefix,
                    ["label"] = issued.Key.Label,
                    ["scopes"] = issued.Key.Scopes,
                    ["expiresAt"] = issued.Key.ExpiresAt
                }
            });

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

        app.MapDelete("/portal/mcp-keys/{id}", async (HttpContext http) =>
        {
            var user = await http.RequireRoleAsync(Surface.PORTAL, "ADMIN", "OPERATOR");
            var id = Validate.RouteUuid(http, "id");

            var service = http.RequestServices.GetRequiredService<McpKeysService>();
            var revoked = await service.RevokeMcpKeyAsync(Guid.Parse(id),
                user.Role == UserRole.ADMIN ? null : user.Id);

            var audit = http.RequestServices.GetRequiredService<Olympia.Infrastructure.Audit.AuditService>();
            await audit.AuditAsync(new Olympia.Infrastructure.Audit.AuditEvent
            {
                Action = "mcp_key_revoked",
                ActorId = user.Id,
                TargetId = revoked.UserId,
                Ip = http.Connection.RemoteIpAddress?.ToString(),
                UserAgent = http.Request.Headers.UserAgent.ToString(),
                Details = new Dictionary<string, object?>
                {
                    ["mcpKeyId"] = revoked.Id,
                    ["prefix"] = revoked.Prefix,
                    ["label"] = revoked.Label
                }
            });

            http.Response.StatusCode = 204;
            return Results.Empty;
        });

        return app;
    }
}
