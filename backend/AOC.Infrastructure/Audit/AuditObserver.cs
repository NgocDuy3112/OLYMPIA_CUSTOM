using System.Text.Json;

namespace AOC.Infrastructure.Audit;

public sealed record AuditRecord(
    Guid Id,
    string Action,
    Guid? ActorId,
    Guid? TargetId,
    Guid? MatchId,
    JsonElement? Details,
    string? Ip,
    string? UserAgent,
    DateTime CreatedAt);

public interface IAuditObserver
{
    Task OnAuditWrittenAsync(AuditRecord record);
}
