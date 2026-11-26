using AOC.Infrastructure.Auth;
using AOC.Infrastructure.Configuration;

namespace AOC.Api.Http;

public sealed class HubAuthMiddleware(RequestDelegate next)
{
    private sealed record Gate(Surface Surface, string[] Roles);

    private static readonly Gate GameplayGate = new(Surface.GAMEPLAY, []);
    private static readonly Gate ConsoleGate = new(Surface.PORTAL, ["ADMIN", "OPERATOR"]);
    private static readonly Gate AuditGate = new(Surface.PORTAL, ["ADMIN"]);

    public async Task InvokeAsync(HttpContext http)
    {
        var gate = GateFor(http.Request.Path.Value ?? "");
        if (gate is null)
        {
            await next(http);
            return;
        }

        var tokens = http.RequestServices.GetRequiredService<SessionTokens>();
        if (!http.Request.Cookies.TryGetValue(CookieNames.For(gate.Surface), out var token)
            || string.IsNullOrEmpty(token))
            throw ApiException.Unauthorized("Missing session cookie");

        SessionTokenPayload payload;
        try
        {
            payload = tokens.VerifySession(gate.Surface, token);
        }
        catch
        {
            throw ApiException.Unauthorized("Invalid or expired session");
        }

        if (gate.Roles.Length > 0 && !gate.Roles.Contains(payload.Role))
            throw ApiException.Forbidden("Insufficient role");

        await next(http);
    }

    private static Gate? GateFor(string path)
    {
        if (path == "/portal/audit/stream") return AuditGate;
        if (!path.EndsWith("/live/stream", StringComparison.Ordinal)) return null;
        if (path.StartsWith("/api/matches/", StringComparison.Ordinal)) return GameplayGate;
        if (path.StartsWith("/portal/tournaments/", StringComparison.Ordinal)) return ConsoleGate;
        return null;
    }
}
