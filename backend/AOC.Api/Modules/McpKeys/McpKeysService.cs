using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using AOC.Api.Http;
using AOC.Infrastructure.Data;
using AOC.Infrastructure.Data.Entities;

namespace AOC.Api.Modules.McpKeys;

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

public sealed class McpKeysService(AOCDbContext db)
{
    public static readonly TimeSpan LastUsedWriteInterval = TimeSpan.FromSeconds(60);
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

    public sealed record RevokedMcpKeys(int Revoked, List<Guid> Ids);

    public sealed record VerifiedMcpKey(PublicMcpKey Key, UserEntity User);

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

    public async Task<RevokedMcpKeys> RevokeMcpKeysAsync(List<Guid> ids, Guid? onlyOwnedBy)
    {
        var query = db.McpKeys.AsQueryable();
        if (onlyOwnedBy is not null) query = query.Where(k => k.UserId == onlyOwnedBy);

        var found = await query.AsNoTracking()
            .Where(k => ids.Contains(k.Id))
            .Select(k => k.Id)
            .ToListAsync();

        var revoked = await query
            .Where(k => ids.Contains(k.Id) && k.RevokedAt == null)
            .ExecuteUpdateAsync(setters => setters.SetProperty(k => k.RevokedAt, DateTime.UtcNow));

        return new RevokedMcpKeys(revoked, found);
    }

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

        var now = DateTime.UtcNow;
        if (key.LastUsedAt <= now - LastUsedWriteInterval)
        {
            var tracked = await db.McpKeys.FirstAsync(k => k.Id == key.Id);
            tracked.LastUsedAt = now;
            if (ip is not null && ip != tracked.LastIp) tracked.LastIp = ip;
            if (userAgent is not null && userAgent != tracked.LastUserAgent) tracked.LastUserAgent = userAgent;
            await db.SaveChangesAsync();
        }

        return new VerifiedMcpKey(PublicOf(key), user);

        static T Unauthorized2<T>(string message) =>
            throw new McpKeyError(McpKeyErrorCode.UNAUTHORIZED, message);
    }
}
