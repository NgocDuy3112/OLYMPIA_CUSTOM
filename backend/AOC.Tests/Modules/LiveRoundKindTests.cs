using AOC.Api.Modules.Live;
using AOC.Domain.Contracts;
using AOC.Infrastructure.Data;
using AOC.Tests.Auth;
using Xunit;

namespace AOC.Tests.Modules;

public class LiveRoundKindTests
{
    private sealed record Seeded(McpToolHarness Harness, Guid TournamentId, Guid MatchId, Guid OwnerId);

    private static async Task<Seeded> SeedAsync(string liveRoundId)
    {
        await AuthTestDb.EnsureSchemaAsync();
        var harness = McpToolHarness.Open();
        var ownerId = await harness.SeedUserAsync(UserRole.OPERATOR);
        var tournamentId = await harness.SeedTournamentAsync(
            ownerId, Visibility.PRIVATE, "but-pha", "ve-dich");
        var matchId = await harness.SeedMatchAsync(tournamentId, MatchStatus.LIVE);
        await harness.SeedLiveAsync(matchId, roundId: liveRoundId);
        return new Seeded(harness, tournamentId, matchId, ownerId);
    }

    [DbFact]
    public async Task An_action_of_another_round_is_refused()
    {
        var seeded = await SeedAsync("but-pha");
        using var harness = seeded.Harness;

        var error = await Assert.ThrowsAsync<RuleError>(() => harness.Live.ApplyLiveActionAsync(
            seeded.TournamentId, seeded.MatchId, 3, new LiveAction.VeDichStart(null), seeded.OwnerId));

        Assert.Equal("WRONG_ROUND", error.Code);
    }

    [DbFact]
    public async Task An_action_of_the_current_round_gets_past_the_round_check()
    {
        var seeded = await SeedAsync("but-pha");
        using var harness = seeded.Harness;

        try
        {
            await harness.Live.ApplyLiveActionAsync(
                seeded.TournamentId, seeded.MatchId, 3, new LiveAction.ButPhaStart(), seeded.OwnerId);
        }
        catch (RuleError error)
        {
            Assert.NotEqual("WRONG_ROUND", error.Code);
        }
    }
}
