using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using AOC.Api.Modules.Audit;
using AOC.Infrastructure.Data;
using AOC.Infrastructure.Data.Entities;
using AOC.Tests.Auth;
using Xunit;

namespace AOC.Tests.Modules;

public class AuditRetentionTests
{
    private static AuditRetentionService ServiceFor(AOCDbContext db, int days)
    {
        var services = new ServiceCollection();
        services.AddSingleton(db);
        services.AddSingleton(AuditExportOptions.Default);
        services.AddScoped<AuditEventStore>();
        var provider = services.BuildServiceProvider();
        return new AuditRetentionService(
            provider.GetRequiredService<IServiceScopeFactory>(),
            new AuditRetentionOptions(days),
            NullLogger<AuditRetentionService>.Instance);
    }

    private static readonly Guid AgedId = Guid.NewGuid();
    private static readonly Guid FreshId = Guid.NewGuid();

    private static AuditEventEntity Event(Guid id, string action, DateTime createdAt) => new()
    {
        Id = id,
        Action = action,
        CreatedAt = createdAt,
        Details = JsonSerializer.SerializeToElement(new { marker = action })
    };

    private static async Task SeedAsync(AOCDbContext db)
    {
        await AuthTestDb.EnsureSchemaAsync();
        var now = DateTime.UtcNow;
        db.AuditEvents.AddRange(
            Event(AgedId, "retention_aged", now.AddDays(-200)),
            Event(FreshId, "retention_fresh", now.AddDays(-1)));
        await db.SaveChangesAsync();
    }

    private static async Task CleanupAsync(AOCDbContext db)
    {
        db.AuditEvents.RemoveRange(db.AuditEvents.Where(e =>
            e.Id == AgedId || e.Id == FreshId));
        await db.SaveChangesAsync();
    }

    [DbFact]
    public async Task Pruning_removes_only_events_past_the_retention_window()
    {
        var db = AuthTestDb.OpenDb();
        await SeedAsync(db);
        try
        {
            var removed = await ServiceFor(db, 180).PruneAsync(CancellationToken.None);

            Assert.True(removed >= 1);
            Assert.False(await db.AuditEvents.AnyAsync(e => e.Id == AgedId));
            Assert.True(await db.AuditEvents.AnyAsync(e => e.Id == FreshId));
        }
        finally
        {
            await CleanupAsync(db);
        }
    }

    [DbFact]
    public async Task A_zero_day_window_disables_pruning()
    {
        var db = AuthTestDb.OpenDb();
        await SeedAsync(db);
        try
        {
            var removed = await ServiceFor(db, 0).PruneAsync(CancellationToken.None);

            Assert.Equal(0, removed);
            Assert.True(await db.AuditEvents.AnyAsync(e => e.Id == AgedId));
        }
        finally
        {
            await CleanupAsync(db);
        }
    }
}
