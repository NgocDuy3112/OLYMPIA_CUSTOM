using System.Text.Json;
using AOC.Infrastructure.Audit;

namespace AOC.Api.Modules.Mcp;

public enum McpToolOutcome
{
    allowed,
    denied,
    failed
}

public sealed record McpToolCallAudit(
    Guid McpKeyId,
    string Tool,
    McpToolOutcome Outcome,
    Guid? TournamentId,
    Guid? MatchId,
    JsonElement? Filters,
    int? Total,
    string? Error)
{
    public static string ActionOf(McpToolOutcome outcome) => outcome switch
    {
        McpToolOutcome.allowed => "mcp_tool_call",
        McpToolOutcome.denied => "mcp_tool_denied",
        McpToolOutcome.failed => "mcp_tool_failed",
        _ => "mcp_tool_failed"
    };
}

public static class McpToolAudit
{
    public static Task RecordAsync(
        AuditService audit, HttpContext? http, Guid? actorId, McpToolCallAudit details)
        => audit.AuditAsync(new AuditEvent
        {
            Action = McpToolCallAudit.ActionOf(details.Outcome),
            ActorId = actorId,
            Ip = http?.Connection.RemoteIpAddress?.ToString(),
            UserAgent = http?.Request.Headers.UserAgent.ToString(),
            Details = details
        });
}
