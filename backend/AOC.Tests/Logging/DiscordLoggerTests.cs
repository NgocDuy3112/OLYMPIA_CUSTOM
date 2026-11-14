using AOC.Api.Logging;
using AOC.Infrastructure.Configuration;
using Microsoft.Extensions.Logging;
using Xunit;

namespace AOC.Tests.Logging;

/// <summary>The Discord mirror: what reaches the webhook, what stays in the console,
/// and every way a logger could ruin a live show (it must not).</summary>
public class DiscordLoggerTests
{
    private const string Webhook = "https://discord.example/api/webhooks/1/token";

    private sealed class Capture
    {
        public List<string> Payloads { get; } = [];
        public int Attempts;

        public Task Send(string content, CancellationToken cancellationToken)
        {
            lock (Payloads) Payloads.Add(content);
            Attempts += 1;
            return Task.CompletedTask;
        }

        public Task Fail(string content, CancellationToken cancellationToken)
        {
            Attempts += 1;
            throw new InvalidOperationException("the web is down");
        }

        public string Only()
        {
            lock (Payloads)
            {
                Assert.Single(Payloads);
                return Payloads[0];
            }
        }
    }

    private static DiscordLoggerProvider Provider(Capture capture, string level = "Warning", string? url = Webhook) =>
        new(new DiscordLogOptions(url, level), capture.Send);

    [Fact]
    public async Task WarningsAndAboveReachTheWebhook_InfoStaysInTheConsole()
    {
        var capture = new Capture();
        var provider = Provider(capture);
        var logger = provider.CreateLogger("AOC.Tests.Demo");

        logger.LogInformation("quiet {N}", 1);   // below the floor: console only
        logger.LogWarning("loud {N}", 2);

        await provider.FlushAsync();
        var payload = capture.Only();
        Assert.Contains("loud 2", payload);
        Assert.DoesNotContain("quiet", payload);
    }

    [Fact]
    public async Task AWarningIsRenderedAsOneReadableDiscordLine()
    {
        var capture = new Capture();
        var provider = Provider(capture);
        var logger = provider.CreateLogger("AOC.Api.Live.LiveService");

        logger.LogWarning("sfx cue for match {MatchId} failed", "m1");

        await provider.FlushAsync();
        var payload = capture.Only();

        Assert.Contains("[Warning]", payload);
        Assert.Contains("Live.LiveService", payload);   // short category, no namespace noise
        Assert.Contains("sfx cue for match m1 failed", payload);
        Assert.Contains("🟧", payload);
        Assert.Contains("UTC`", payload);
    }

    [Fact]
    public async Task TheLevelFloorIsTheConfigsChoice()
    {
        var capture = new Capture();
        var provider = Provider(capture, level: "Error");
        var logger = provider.CreateLogger("AOC.Tests.Demo");

        logger.LogWarning("a warning, but below the floor");
        await provider.FlushAsync();
        Assert.Empty(capture.Payloads);

        logger.LogError("now we are above it");
        await provider.FlushAsync();
        Assert.Contains("now we are above it", capture.Only());
    }

    [Fact]
    public async Task NoWebhookUrl_MeansCompletelyInert()
    {
        var capture = new Capture();
        var provider = new DiscordLoggerProvider(new DiscordLogOptions(null, "Warning"), capture.Send);
        var logger = provider.CreateLogger("AOC.Tests.Demo");

        Assert.False(provider.IsLevelEnabled(LogLevel.Warning));
        logger.LogCritical("must never leave the box");
        await provider.FlushAsync();

        Assert.Empty(capture.Payloads);
        Assert.Equal(0, capture.Attempts);
    }

    [Fact]
    public async Task ExceptionsRideAlong_TypeAndMessageAtLeast()
    {
        var capture = new Capture();
        var provider = Provider(capture);
        var logger = provider.CreateLogger("AOC.Tests.Demo");

        logger.LogError(new TimeoutException("upstream timed out"), "request failed");

        await provider.FlushAsync();
        var payload = capture.Only();
        Assert.Contains("TimeoutException", payload);
        Assert.Contains("upstream timed out", payload);
        Assert.Contains("🟥", payload);
    }

    [Fact]
    public async Task ARunawayStackIsTruncatedToDiscordsCapNotDropped()
    {
        var capture = new Capture();
        var provider = Provider(capture);
        var logger = provider.CreateLogger("AOC.Tests.Demo");

        logger.LogError(new InvalidOperationException(new string('x', 5_000)), "huge");

        await provider.FlushAsync();
        var payload = capture.Only();
        Assert.True(payload.Length <= DiscordLoggerProvider.ContentLimit,
            $"payload was {payload.Length} chars — Discord would 400 it");
        Assert.EndsWith("…", payload);
    }

    [Fact]
    public async Task AFailedDeliveryIsSwallowed_TheShowGoesOn()
    {
        var provider = new DiscordLoggerProvider(new DiscordLogOptions(Webhook, "Warning"),
            (content, token) => throw new InvalidOperationException("discord 500"));
        var logger = provider.CreateLogger("AOC.Tests.Demo");

        logger.LogError("something broke");
        await provider.FlushAsync();   // must not throw — ever

        provider.Dispose();
    }

    [Fact]
    public async Task AStampedeShedsTheOldestLinesAndSaysHowMany()
    {
        var capture = new Capture();
        var provider = Provider(capture);
        var logger = provider.CreateLogger("AOC.Tests.Demo");

        for (var i = 0; i < 250; i += 1) logger.LogWarning("line {I}", i);

        await provider.FlushAsync();
        var payload = capture.Only();
        Assert.Contains("older line(s) dropped", payload);
        Assert.True(payload.Length <= DiscordLoggerProvider.ContentLimit);
    }
}
