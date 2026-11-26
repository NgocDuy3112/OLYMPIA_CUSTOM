using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using AOC.Infrastructure.Data;
using AOC.Infrastructure.Data.Entities;

namespace AOC.Infrastructure.Audit;

public sealed class AuditEvent
{
    public string Action { get; set; } = "";
    public Guid? ActorId { get; set; }
    public Guid? TargetId { get; set; }
    public Guid? MatchId { get; set; }
    public object? Details { get; set; }
    public string? Ip { get; set; }
    public string? UserAgent { get; set; }
}

public sealed class AuditService(
    AOCDbContext db,
    ILogger<AuditService> logger,
    IEnumerable<IAuditObserver> observers)
{
    private static readonly TimeSpan ObserverTimeout = TimeSpan.FromSeconds(5);

    public async Task AuditAsync(AuditEvent e)
    {
        AuditRecord record;
        try
        {
            var entity = new AuditEventEntity
            {
                Action = e.Action,
                ActorId = e.ActorId,
                TargetId = e.TargetId,
                MatchId = e.MatchId,
                Details = e.Details is null ? null : JsonSerializer.SerializeToElement(e.Details, JsonDefaults.Options),
                Ip = e.Ip,
                UserAgent = e.UserAgent
            };
            db.AuditEvents.Add(entity);
            await db.SaveChangesAsync();

            record = new AuditRecord(entity.Id, entity.Action, entity.ActorId, entity.TargetId,
                entity.MatchId, entity.Details, entity.Ip, entity.UserAgent, entity.CreatedAt);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "audit write failed for \"{Action}\"", e.Action);
            return;
        }

        foreach (var observer in observers)
            _ = NotifyAsync(observer, record);
    }

    private async Task NotifyAsync(IAuditObserver observer, AuditRecord record)
    {
        try
        {
            await observer.OnAuditWrittenAsync(record).WaitAsync(ObserverTimeout);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "audit observer failed for \"{Action}\"", record.Action);
        }
    }
}
