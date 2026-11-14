using AOC.Api.Http;
using AOC.Infrastructure.Data.Entities;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Xunit;

namespace AOC.Tests.Http;

/// <summary>The request line: what the console (and, at Error, Discord) sees per request.</summary>
public class RequestLoggingTests
{
    private sealed class Recorder : ILogger<RequestLoggingMiddleware>
    {
        public List<(LogLevel Level, string Line)> Entries { get; } = [];

        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

        public bool IsEnabled(LogLevel level) => true;

        public void Log<TState>(
            LogLevel level,
            EventId eventId,
            TState state,
            Exception? exception,
            Func<TState, Exception?, string> formatter)
            => Entries.Add((level, formatter(state, exception)));
    }

    private static async Task<Recorder> RunAsync(
        string target,
        Action<HttpContext> behave,
        Guid? userId = null)
    {
        var recorder = new Recorder();
        var context = new DefaultHttpContext();
        context.Request.Method = "GET";

        var queryAt = target.IndexOf('?');
        context.Request.Path = queryAt < 0 ? target : target[..queryAt];
        if (queryAt >= 0) context.Request.QueryString = new QueryString(target[queryAt..]);

        if (userId is { } uid)
            context.Items[Guards.SessionUserKey] = new UserEntity { Id = uid, DisplayName = "Ada" };

        var middleware = new RequestLoggingMiddleware(
            ctx => { behave(ctx); return Task.CompletedTask; },
            recorder);

        await middleware.InvokeAsync(context);
        return recorder;
    }

    [Fact]
    public async Task OneLinePerRequest_MethodPathStatusAndDuration()
    {
        var recorder = await RunAsync("/portal/players", _ => { });

        var entry = Assert.Single(recorder.Entries);
        Assert.Equal(LogLevel.Information, entry.Level);
        Assert.Contains("GET", entry.Line);
        Assert.Contains("/portal/players", entry.Line);
        Assert.Contains("→ 200", entry.Line);
        Assert.Contains("ms", entry.Line);
    }

    [Fact]
    public async Task TheQueryStringRidesAlong_ItExplainsTheRequest()
    {
        var recorder = await RunAsync("/tournaments/t1/matches/m1?add=q9", _ => { });

        Assert.Contains("add=q9", Assert.Single(recorder.Entries).Line);
    }

    [Fact]
    public async Task A500IsLoggedAsError_ThatIsWhatTheDiscordMirrorPicksUp()
    {
        var recorder = await RunAsync("/portal/boom", ctx => ctx.Response.StatusCode = 500);

        var entry = Assert.Single(recorder.Entries);
        Assert.Equal(LogLevel.Error, entry.Level);
        Assert.Contains("→ 500", entry.Line);
    }

    [Fact]
    public async Task A404StaysInformational_ConsoleYes_DiscordNo()
    {
        var recorder = await RunAsync("/portal/missing", ctx => ctx.Response.StatusCode = 404);

        var entry = Assert.Single(recorder.Entries);
        Assert.Equal(LogLevel.Information, entry.Level);
        Assert.Contains("→ 404", entry.Line);
    }

    [Fact]
    public async Task TheSessionUserIsNamedOnTheLine()
    {
        var uid = Guid.NewGuid();
        var recorder = await RunAsync("/portal/players", _ => { }, uid);

        Assert.Contains($"· user {uid}", Assert.Single(recorder.Entries).Line);
    }

    [Fact]
    public async Task HealthChecksStayOutOfTheLog_TheyWouldDrownIt()
    {
        var recorder = await RunAsync("/health", _ => { });

        Assert.Empty(recorder.Entries);
    }

    [Fact]
    public async Task ARunawayQueryStringIsCutNotPrinted()
    {
        var recorder = await RunAsync("/search?q=" + new string('x', 600), _ => { });

        var line = Assert.Single(recorder.Entries).Line;
        Assert.Contains("…", line);
        Assert.True(line.Length < 400, $"line was {line.Length} chars — one request, one glance");
    }
}
