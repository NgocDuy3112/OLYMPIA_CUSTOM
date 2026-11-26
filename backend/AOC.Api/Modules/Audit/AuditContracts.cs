using System.Text.Json;

namespace AOC.Api.Modules.Audit;

public sealed record AuditEventRow(
    Guid Id,
    string Action,
    Guid? ActorId,
    string? ActorName,
    Guid? TargetId,
    string? TargetName,
    Guid? MatchId,
    JsonElement? Details,
    string? Ip,
    string? UserAgent,
    DateTime CreatedAt);

public sealed record AuditActionsResponse(string[] Actions);

public sealed record AuditCsvExport(string FileName, string Content);

public sealed class AuditFilter
{
    public IReadOnlyList<string> Actions { get; init; } = [];
    public Guid? ActorId { get; init; }
    public Guid? TargetId { get; init; }
    public Guid? MatchId { get; init; }
    public DateTime? From { get; init; }
    public DateTime? To { get; init; }
    public string? Search { get; init; }
}
