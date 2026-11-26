using AOC.Api.Http;
using AOC.Infrastructure.Audit;
using AOC.Infrastructure.Data.Entities;

namespace AOC.Api.Shared;

public sealed record AuditTarget(Guid? MatchId, Guid? TargetId)
{
    public static AuditTarget Match(string matchId) => new(Guid.Parse(matchId), null);

    public static AuditTarget User(Guid userId) => new(null, userId);

    public static AuditTarget None { get; } = new(null, null);
}

public static class AuditRequest
{
    public static Task AuditAsync(this AuditService audit, HttpContext http, AuditTarget target,
        string action, object? details = null)
        => audit.AuditAsync(http, SessionUserId(http), target, action, details);

    public static Task AuditAsync(this AuditService audit, HttpContext http, Guid? actorId, AuditTarget target,
        string action, object? details = null)
        => audit.AuditAsync(new AuditEvent
        {
            Action = action,
            ActorId = actorId,
            TargetId = target.TargetId,
            MatchId = target.MatchId,
            Details = details,
            Ip = http.Connection.RemoteIpAddress?.ToString(),
            UserAgent = http.Request.Headers.UserAgent.ToString()
        });

    private static Guid? SessionUserId(HttpContext http)
    {
        var user = http.Items.TryGetValue(Guards.SessionUserKey, out var value)
            ? value as UserEntity
            : null;
        return user?.Id;
    }
}
