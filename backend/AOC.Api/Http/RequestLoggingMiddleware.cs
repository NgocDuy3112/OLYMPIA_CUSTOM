using System.Diagnostics;
using AOC.Infrastructure.Data.Entities;

namespace AOC.Api.Http;

public sealed class RequestLoggingMiddleware(RequestDelegate next, ILogger<RequestLoggingMiddleware> logger)
{
    private const int TargetCap = 300;

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

            if (status >= 500) logger.LogError("{Line}", line);
            else logger.LogInformation("{Line}", line);
        }
    }
}
