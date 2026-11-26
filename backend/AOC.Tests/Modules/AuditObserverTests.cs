using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using AOC.Api.Modules.Audit;
using AOC.Api.Modules.Live;
using AOC.Api.Realtime;
using AOC.Infrastructure.Audit;
using AOC.Infrastructure.Data;
using AOC.Tests.Auth;
using Xunit;

namespace AOC.Tests.Modules;

public class AuditObserverTests : IDisposable
{
    private readonly AOCDbContext db = AuthTestDb.OpenDb();

    private sealed class ThrowingObserver : IAuditObserver
    {
        public Task OnAuditWrittenAsync(AuditRecord record)
            => throw new InvalidOperationException("observer boom");
    }

    private sealed class CapturingClient : IClientProxy
    {
        private readonly TaskCompletionSource<(string Method, object?[] Args)> written =
            new(TaskCreationOptions.RunContinuationsAsynchronously);

        public Task<(string Method, object?[] Args)> Written => written.Task;

        public Task SendCoreAsync(string method, object?[] args, CancellationToken cancellationToken = default)
        {
            written.TrySetResult((method, args));
            return Task.CompletedTask;
        }
    }

    private sealed class CapturingHubClients(CapturingClient client) : IHubClients
    {
        public IClientProxy All => client;
        public IClientProxy AllExcept(IReadOnlyList<string> excludedConnectionIds) => client;
        public IClientProxy Client(string connectionId) => client;
        public IClientProxy Clients(IReadOnlyList<string> connectionIds) => client;
        public IClientProxy Group(string groupName) => client;
        public IClientProxy GroupExcept(string groupName, IReadOnlyList<string> excludedConnectionIds) => client;
        public IClientProxy Groups(IReadOnlyList<string> groupNames) => client;
        public IClientProxy User(string userId) => client;
        public IClientProxy Users(IReadOnlyList<string> userIds) => client;
    }

    private sealed class NoGroups : IGroupManager
    {
        public Task AddToGroupAsync(string connectionId, string groupName,
            CancellationToken cancellationToken = default) => Task.CompletedTask;

        public Task RemoveFromGroupAsync(string connectionId, string groupName,
            CancellationToken cancellationToken = default) => Task.CompletedTask;
    }

    private sealed class CapturingHubContext(CapturingClient client) : IHubContext<AuditStreamHub>
    {
        public IHubClients Clients { get; } = new CapturingHubClients(client);
        public IGroupManager Groups { get; } = new NoGroups();
    }

    [DbFact]
    public async Task A_throwing_observer_does_not_fail_the_audit_write()
    {
        await AuthTestDb.EnsureSchemaAsync();
        var action = "zz-throwing-" + Guid.NewGuid().ToString("N");
        var audit = new AuditService(db, NullLogger<AuditService>.Instance, [new ThrowingObserver()]);

        await audit.AuditAsync(new AuditEvent { Action = action });

        var row = await db.AuditEvents.AsNoTracking().SingleAsync(e => e.Action == action);
        Assert.Equal(action, row.Action);
    }

    [DbFact]
    public async Task The_registry_publishes_a_written_event_to_the_audit_stream()
    {
        await AuthTestDb.EnsureSchemaAsync();
        var client = new CapturingClient();
        var services = new ServiceCollection();
        services.AddSingleton(db);
        services.AddScoped<AuditEventStore>();
        using var provider = services.BuildServiceProvider();

        var registry = new AuditStreamRegistry(new CapturingHubContext(client),
            provider.GetRequiredService<IServiceScopeFactory>());
        var audit = new AuditService(db, NullLogger<AuditService>.Instance, [registry]);
        var action = "zz-observer-" + Guid.NewGuid().ToString("N");

        await audit.AuditAsync(new AuditEvent { Action = action, Ip = "127.0.0.1" });

        var (method, args) = await client.Written.WaitAsync(TimeSpan.FromSeconds(10));
        Assert.Equal("message", method);
        var envelope = Assert.IsType<Dictionary<string, object?>>(Assert.Single(args));
        Assert.Equal("audit_event", envelope["type"]);
        var frame = Assert.IsType<Protocol.AuditFrame>(envelope["data"]);
        var row = Assert.IsType<AuditEventRow>(frame.Event);
        Assert.Equal(action, row.Action);
        Assert.Equal("127.0.0.1", row.Ip);
    }

    public void Dispose() => db.Dispose();
}
