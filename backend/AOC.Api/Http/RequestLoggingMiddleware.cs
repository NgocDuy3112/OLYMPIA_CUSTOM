using System.Diagnostics;
using AOC.Infrastructure.Data.Entities;

namespace AOC.Api.Http;

/// <summary>
/// One line per request: `GET /portal/players?limit=100 → 200 in 12ms · user 3f…`
///
/// Information for everything a person caused on purpose (2xx/3xx/4xx — visible in
/// the console at the default level), Error for 5xx so the Discord mirror picks it
/// up. Placed OUTERMOST (before the rate limiter) so even a 429 it produces itself
/// gets a line; /health is polled by the compose healthchecks every few seconds
/// and would drown the log, so it is skipped.
/// </summary>
public sealed class RequestLoggingMiddleware(RequestDelegate next, ILogger<RequestLoggingMiddleware> logger)
{
    private const int TargetCap = 300; // query strings can be long; the log is for humans

    public async Task InvokeAsync(HttpContext context)
    {
        var path = context.Request.Path.Value ?? "/";
        if (path.StartsWith("/health", StringComparison.OrdinalIgnoreCase))
        {
            await next(context);
            return;
        }

        var stopwatch = Stopwatch.StartNew();
        try
        {
            await next(context);
        }
        finally
        {
            stopwatch.Stop();

            var target = path + context.Request.QueryString.Value;
            if (target.Length > TargetCap) target = target[..TargetCap] + "…";

            var status = context.Response.StatusCode;
            var user = context.Items.TryGetValue(Guards.SessionUserKey, out var boxed) && boxed is UserEntity entity
                ? entity.Id.ToString()
                : null;

            var line = $"{context.Request.Method} {target} → {status} in {stopwatch.ElapsedMilliseconds}ms"
                + (user is null ? "" : $" · user {user}");

            // one property, rendered verbatim — the Discord mirror formats it as-is
            if (status >= 500) logger.LogError("{Line}", line);
            else logger.LogInformation("{Line}", line);
        }
    }
}
