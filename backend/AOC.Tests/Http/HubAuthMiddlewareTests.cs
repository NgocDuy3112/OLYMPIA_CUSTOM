using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using AOC.Api.Http;
using AOC.Infrastructure.Auth;
using AOC.Infrastructure.Configuration;
using Xunit;

namespace AOC.Tests.Http;

public class HubAuthMiddlewareTests
{
    private const string PlayerHub = "/api/matches/11111111-1111-1111-1111-111111111111/live/stream";
    private const string ConsoleHub =
        "/portal/tournaments/22222222-2222-2222-2222-222222222222/matches/11111111-1111-1111-1111-111111111111/live/stream";
    private const string SpectateHub =
        "/spectate/tournaments/22222222-2222-2222-2222-222222222222/matches/11111111-1111-1111-1111-111111111111/live/stream";
    private const string AuditHub = "/portal/audit/stream";

    private sealed record Run(bool ReachedNext, ApiException? Refusal);

    private static string Session(Surface surface, string role)
        => new SessionTokens().SignSession(surface, new SessionTokenPayload(Guid.NewGuid().ToString(), role, 1));

    private static async Task<Run> RunAsync(string path, Surface? surface = null, string? role = null)
    {
        var http = new DefaultHttpContext();
        http.Request.Path = path;

        var services = new ServiceCollection();
        services.AddSingleton(new SessionTokens());
        http.RequestServices = services.BuildServiceProvider();

        if (surface is { } cookieSurface && role is { } cookieRole)
            http.Request.Headers.Cookie = $"{CookieNames.For(cookieSurface)}={Session(cookieSurface, cookieRole)}";

        var reached = false;
        var middleware = new HubAuthMiddleware(ctx =>
        {
            reached = true;
            return Task.CompletedTask;
        });

        try
        {
            await middleware.InvokeAsync(http);
            return new Run(reached, null);
        }
        catch (ApiException refusal)
        {
            return new Run(reached, refusal);
        }
    }

    [Fact]
    public async Task Player_hub_refuses_anonymous_upgrades()
        => Assert.Equal(401, (await RunAsync(PlayerHub)).Refusal?.Status);

    [Fact]
    public async Task Player_hub_refuses_a_portal_session()
        => Assert.Equal(401, (await RunAsync(PlayerHub, Surface.PORTAL, "ADMIN")).Refusal?.Status);

    [Fact]
    public async Task Player_hub_upgrades_a_gameplay_session()
    {
        var run = await RunAsync(PlayerHub, Surface.GAMEPLAY, "PLAYER");
        Assert.Null(run.Refusal);
        Assert.True(run.ReachedNext);
    }

    [Fact]
    public async Task Console_hub_refuses_anonymous_upgrades()
        => Assert.Equal(401, (await RunAsync(ConsoleHub)).Refusal?.Status);

    [Fact]
    public async Task Console_hub_refuses_players()
        => Assert.Equal(403, (await RunAsync(ConsoleHub, Surface.PORTAL, "PLAYER")).Refusal?.Status);

    [Fact]
    public async Task Console_hub_upgrades_operators()
    {
        var run = await RunAsync(ConsoleHub, Surface.PORTAL, "OPERATOR");
        Assert.Null(run.Refusal);
        Assert.True(run.ReachedNext);
    }

    [Fact]
    public async Task Console_hub_upgrades_admins()
        => Assert.True((await RunAsync(ConsoleHub, Surface.PORTAL, "ADMIN")).ReachedNext);

    [Fact]
    public async Task Audit_hub_refuses_anonymous_upgrades()
        => Assert.Equal(401, (await RunAsync(AuditHub)).Refusal?.Status);

    [Fact]
    public async Task Audit_hub_refuses_operators()
        => Assert.Equal(403, (await RunAsync(AuditHub, Surface.PORTAL, "OPERATOR")).Refusal?.Status);

    [Fact]
    public async Task Audit_hub_upgrades_admins()
        => Assert.True((await RunAsync(AuditHub, Surface.PORTAL, "ADMIN")).ReachedNext);

    [Fact]
    public async Task Audit_hub_refuses_an_expired_cookie()
    {
        var http = new DefaultHttpContext();
        http.Request.Path = AuditHub;
        var services = new ServiceCollection();
        services.AddSingleton(new SessionTokens());
        http.RequestServices = services.BuildServiceProvider();
        http.Request.Headers.Cookie = $"{CookieNames.Portal}=not-a-token";

        var middleware = new HubAuthMiddleware(_ => Task.CompletedTask);

        var refusal = await Assert.ThrowsAsync<ApiException>(() => middleware.InvokeAsync(http));
        Assert.Equal(401, refusal.Status);
    }

    [Fact]
    public async Task Spectate_hub_upgrades_without_a_session()
        => Assert.True((await RunAsync(SpectateHub)).ReachedNext);

    [Fact]
    public async Task A_non_hub_path_is_untouched()
        => Assert.True((await RunAsync("/api/matches/11111111-1111-1111-1111-111111111111")).ReachedNext);
}
