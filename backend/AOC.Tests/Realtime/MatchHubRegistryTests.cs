using System.Collections.Concurrent;
using Microsoft.Extensions.Logging.Abstractions;
using AOC.Api.Modules.Live;
using AOC.Api.Realtime;
using Xunit;

namespace AOC.Tests.Realtime;

public class MatchHubRegistryTests
{
    private static MatchHubRegistry Registry()
        => new(NullLogger<MatchHubRegistry>.Instance);

    [Fact]
    public async Task Publish_pushes_every_subscriber_of_the_match_concurrently()
    {
        var registry = Registry();
        var release = new TaskCompletionSource();
        var secondStarted = new TaskCompletionSource();

        registry.Subscribe("m1", new HubSubscriber("slow", async (_, _) => await release.Task));
        registry.Subscribe("m1", new HubSubscriber("quick", (_, _) =>
        {
            secondStarted.SetResult();
            return Task.CompletedTask;
        }));

        var publish = registry.PublishAsync("m1");

        await secondStarted.Task.WaitAsync(TimeSpan.FromSeconds(5));
        Assert.False(publish.IsCompleted);

        release.SetResult();
        await publish.WaitAsync(TimeSpan.FromSeconds(5));
    }

    [Fact]
    public async Task A_subscriber_that_never_returns_does_not_hold_the_match()
    {
        var registry = Registry();
        var pushes = new int[1];

        registry.Subscribe("m1", new HubSubscriber("stuck",
            async (_, token) => await Task.Delay(Timeout.InfiniteTimeSpan, token)));
        registry.Subscribe("m1", new HubSubscriber("ok", (_, _) =>
        {
            Interlocked.Increment(ref pushes[0]);
            return Task.CompletedTask;
        }));

        await registry.PublishAsync("m1").WaitAsync(TimeSpan.FromSeconds(30));

        Assert.Equal(1, pushes[0]);
    }

    [Fact]
    public async Task One_publish_reads_the_controller_once_for_every_subscriber()
    {
        var registry = Registry();
        var reads = new int[1];
        var matchId = Guid.NewGuid();
        var controller = new MatchController(Guid.NewGuid(), "Operator", true);

        for (var i = 0; i < 3; i++)
        {
            registry.Subscribe("m1", new HubSubscriber($"sub-{i}", async (scope, _) =>
            {
                var seen = await scope.ControllerOfAsync(matchId, _ =>
                {
                    Interlocked.Increment(ref reads[0]);
                    return Task.FromResult<MatchController?>(controller);
                });
                Assert.Same(controller, seen);
            }));
        }

        await registry.PublishAsync("m1");

        Assert.Equal(1, reads[0]);
    }

    [Fact]
    public async Task Separate_publishes_read_the_controller_again()
    {
        var registry = Registry();
        var reads = new int[1];
        var matchId = Guid.NewGuid();

        registry.Subscribe("m1", new HubSubscriber("sub", async (scope, _) =>
            await scope.ControllerOfAsync(matchId, _ =>
            {
                Interlocked.Increment(ref reads[0]);
                return Task.FromResult<MatchController?>(null);
            })));

        await registry.PublishAsync("m1");
        await registry.PublishAsync("m1");

        Assert.Equal(2, reads[0]);
    }

    [Fact]
    public async Task Concurrent_subscribers_of_one_publish_share_a_single_read()
    {
        var registry = Registry();
        var matchId = Guid.NewGuid();
        var reads = new ConcurrentBag<int>();
        var release = new TaskCompletionSource();

        registry.Subscribe("m1", new HubSubscriber("a", async (scope, _) =>
            await scope.ControllerOfAsync(matchId, async _ =>
            {
                reads.Add(1);
                await release.Task;
                return new MatchController(Guid.NewGuid(), "Operator", true);
            })));
        registry.Subscribe("m1", new HubSubscriber("b", async (scope, _) =>
            await scope.ControllerOfAsync(matchId, _ =>
            {
                reads.Add(1);
                return Task.FromResult<MatchController?>(null);
            })));

        var publish = registry.PublishAsync("m1");
        await Task.Delay(50);
        release.SetResult();
        await publish;

        Assert.Single(reads);
    }
}
