using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Olympia.Infrastructure.Data;
using Olympia.Infrastructure.Data.Entities;

namespace Olympia.Infrastructure.Audit;

public sealed class AuditEvent
{
    public string Action { get; set; } = "";
    public Guid? ActorId { get; set; }
    public Guid? TargetId { get; set; }
    public Guid? MatchId { get; set; }
    public Dictionary<string, object?>? Details { get; set; }
    public string? Ip { get; set; }
    public string? UserAgent { get; set; }
}

/// <summary>Port of audit/service.ts — fire-and-forget audit writes that never break requests.</summary>
public sealed class AuditService(OlympiaDbContext db, ILogger<AuditService> logger)
{
    public async Task AuditAsync(AuditEvent e)
    {
        try
        {
            db.AuditEvents.Add(new AuditEventEntity
            {
                Action = e.Action,
                ActorId = e.ActorId,
                TargetId = e.TargetId,
                MatchId = e.MatchId,
                Details = e.Details is null ? null : JsonSerializer.SerializeToElement(e.Details, JsonDefaults.Options),
                Ip = e.Ip,
                UserAgent = e.UserAgent
            });
            await db.SaveChangesAsync();
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "audit write failed for \"{Action}\"", e.Action);
        }
    }

    public static Dictionary<string, object?> McpAuditDetails(Guid mcpKeyId, Dictionary<string, object?>? extra = null)
    {
        var details = new Dictionary<string, object?> { ["mcpKeyId"] = mcpKeyId };
        if (extra is not null)
            foreach (var (k, v) in extra)
                details[k] = v;
        return details;
    }
}
