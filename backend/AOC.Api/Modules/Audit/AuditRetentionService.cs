using AOC.Infrastructure.Data;

namespace AOC.Api.Modules.Audit;

public sealed record AuditRetentionOptions(int Days)
{
    public static AuditRetentionOptions Default { get; } = new(180);
}

public sealed class AuditRetentionService(
    IServiceScopeFactory scopes,
    AuditRetentionOptions options,
    ILogger<AuditRetentionService> logger) : BackgroundService
{
    private const int BatchSize = 10_000;

    private static readonly TimeSpan SweepInterval = TimeSpan.FromDays(1);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (options.Days <= 0)
        {
            logger.LogInformation("audit retention disabled");
            return;
        }

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await PruneAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "audit retention sweep failed");
            }

            try
            {
                await Task.Delay(SweepInterval, stoppingToken);
            }
            catch (OperationCanceledException)
            {
                return;
            }
        }
    }

    public async Task<int> PruneAsync(CancellationToken token)
    {
        if (options.Days <= 0) return 0;

        var cutoff = DateTime.UtcNow.AddDays(-options.Days);
        using var scope = scopes.CreateScope();
        var store = scope.ServiceProvider.GetRequiredService<AuditEventStore>();

        var removed = 0;
        while (true)
        {
            var batch = await store.DeleteOlderThanAsync(cutoff, BatchSize, token);
            if (batch == 0) break;
            removed += batch;
        }

        if (removed > 0)
            logger.LogInformation("audit retention removed {Rows} events older than {Cutoff:o}", removed, cutoff);
        return removed;
    }
}
