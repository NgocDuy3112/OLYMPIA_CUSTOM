using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Connections.Features;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.DependencyInjection;
using AOC.Api.Http;
using AOC.Api.Realtime;
using AOC.Infrastructure.Auth;
using AOC.Infrastructure.Configuration;
using AOC.Infrastructure.Data;
using AOC.Infrastructure.Data.Entities;
using AOC.Tests.Auth;
using Xunit;

namespace AOC.Tests.Realtime;

public class AuditStreamHubTests : IDisposable
{
    private sealed record Seeded(ServiceProvider Services, Guid AdminId, Guid OperatorId);

    private readonly AOCDbContext db = AuthTestDb.OpenDb();

    private async Task<Seeded> SeedAsync()
    {
        await AuthTestDb.EnsureSchemaAsync();
        var now = DateTime.UtcNow;
        var admin = new UserEntity
        {
            Id = Guid.NewGuid(),
            Role = UserRole.ADMIN,
            Username = "stream-admin-" + Guid.NewGuid().ToString("N")[..8],
            DisplayName = "Stream Admin",
            TokenVersion = 1,
            CreatedAt = now,
            UpdatedAt = now
        };
        var op = new UserEntity
        {
            Id = Guid.NewGuid(),
            Role = UserRole.OPERATOR,
            Username = "stream-operator-" + Guid.NewGuid().ToString("N")[..8],
            DisplayName = "Stream Operator",
            TokenVersion = 1,
            CreatedAt = now,
            UpdatedAt = now
        };
        db.Users.AddRange(admin, op);
        await db.SaveChangesAsync();

        var services = new ServiceCollection();
        services.AddSingleton(db);
        services.AddSingleton(new SessionTokens());
        return new Seeded(services.BuildServiceProvider(), admin.Id, op.Id);
    }

    private sealed class CapturingClient : IClientProxy
    {
        public List<(string Method, object?[] Args)> Sent { get; } = [];

        public Task SendCoreAsync(string method, object?[] args, CancellationToken cancellationToken = default)
        {
            Sent.Add((method, args));
            return Task.CompletedTask;
        }
    }

    private sealed class FakeHubClients(CapturingClient client) : IHubCallerClients
    {
        public IClientProxy Caller => client;
        public IClientProxy Others => client;
        public IClientProxy OthersInGroup(string groupName) => client;
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

    private sealed class HttpContextFeature(HttpContext http) : IHttpContextFeature
    {
        public HttpContext? HttpContext { get; set; } = http;
    }

    private sealed class FakeHubCallerContext(HttpContext http) : HubCallerContext
    {
        private readonly CancellationTokenSource aborted = new();

        public bool Aborted { get; private set; }

        public override string ConnectionId => "audit-test-connection";
        public override string? UserIdentifier => null;
        public override ClaimsPrincipal? User => http.User;
        public override IDictionary<object, object?> Items { get; } = new Dictionary<object, object?>();
        public override CancellationToken ConnectionAborted => aborted.Token;
        public override FeatureCollection Features { get; } = new();

        public FakeHubCallerContext WithHttpContext()
        {
            Features.Set<IHttpContextFeature>(new HttpContextFeature(http));
            return this;
        }

        public override void Abort()
        {
            Aborted = true;
            aborted.Cancel();
        }
    }

    private static DefaultHttpContext ContextFor(Seeded seeded, string? role)
    {
        var http = new DefaultHttpContext { RequestServices = seeded.Services };
        if (role is null) return http;
        var userId = role == "ADMIN" ? seeded.AdminId : seeded.OperatorId;
        var token = new SessionTokens().SignSession(Surface.PORTAL,
            new SessionTokenPayload(userId.ToString(), role, 1));
        http.Request.Headers.Cookie = $"{CookieNames.For(Surface.PORTAL)}={token}";
        return http;
    }

    private static async Task<(FakeHubCallerContext Context, List<(string Method, object?[] Args)> Sent)> ConnectAsync(
        Seeded seeded, string? role)
    {
        var client = new CapturingClient();
        var context = new FakeHubCallerContext(ContextFor(seeded, role)).WithHttpContext();
        var hub = new AuditStreamHub { Context = context, Clients = new FakeHubClients(client) };

        await hub.OnConnectedAsync();

        return (context, client.Sent);
    }

    [DbFact]
    public async Task Audit_stream_aborts_connections_without_a_portal_session()
    {
        var seeded = await SeedAsync();
        try
        {
            var (context, sent) = await ConnectAsync(seeded, null);

            Assert.True(context.Aborted);
            var envelope = Assert.IsType<Dictionary<string, object?>>(Assert.Single(Assert.Single(sent).Args));
            Assert.Equal("error", envelope["type"]);
            Assert.Equal(4401, envelope["code"]);
        }
        finally
        {
            await seeded.Services.DisposeAsync();
        }
    }

    [DbFact]
    public async Task Audit_stream_rejects_operators()
    {
        var seeded = await SeedAsync();
        try
        {
            var (context, sent) = await ConnectAsync(seeded, "OPERATOR");

            Assert.True(context.Aborted);
            var envelope = Assert.IsType<Dictionary<string, object?>>(Assert.Single(Assert.Single(sent).Args));
            Assert.Equal("error", envelope["type"]);
            Assert.Equal(4403, envelope["code"]);
        }
        finally
        {
            await seeded.Services.DisposeAsync();
        }
    }

    [DbFact]
    public async Task Audit_stream_admits_admins()
    {
        var seeded = await SeedAsync();
        try
        {
            var (context, sent) = await ConnectAsync(seeded, "ADMIN");

            Assert.False(context.Aborted);
            Assert.Empty(sent);
        }
        finally
        {
            await seeded.Services.DisposeAsync();
        }
    }

    public void Dispose() => db.Dispose();
}
