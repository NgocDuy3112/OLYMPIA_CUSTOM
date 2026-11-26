using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using AOC.Api.Http;
using AOC.Api.Modules.Matches;
using AOC.Api.Modules.Tournaments;
using AOC.Domain.Contracts;
using AOC.Infrastructure.Data;
using AOC.Infrastructure.Data.Entities;
using AOC.Tests.Auth;
using Xunit;

namespace AOC.Tests.Modules;

public class TypedRootPayloadTests
{
    private static JsonElement Wire<T>(T value) => JsonSerializer.SerializeToElement(value, JsonApi.Options);

    private static List<string> KeysOf(JsonElement element)
        => element.EnumerateObject().Select(p => p.Name).ToList();

    private static MatchEntity Match()
    {
        var now = DateTime.UtcNow;
        return new MatchEntity
        {
            Id = Guid.NewGuid(),
            TournamentId = Guid.NewGuid(),
            StageId = "stage-1",
            ScheduledAt = now,
            Label = "Vòng 1",
            Status = MatchStatus.LIVE,
            Slot = 2,
            Players = JsonDefaults.Serialize(new[] { new Seat { Kind = "user", UserId = Guid.NewGuid().ToString(), Seed = 1 } }),
            RoundConfigs = JsonDefaults.Serialize(new Dictionary<string, RoundConfig>()),
            Questions = JsonDefaults.Serialize(Array.Empty<MatchQuestion>()),
            AssemblyRevision = 3,
            AssembledAt = now,
            ControllerId = Guid.NewGuid(),
            Live = JsonDefaults.Serialize(new { stage = "khoi-dong" }),
            Discord = JsonDefaults.Serialize(new { channelId = "c1" }),
            CreatedAt = now,
            UpdatedAt = now
        };
    }

    [Fact]
    public void MatchSummary_carries_only_what_the_portal_reads()
    {
        var wire = Wire(MatchSummary.Of(Match()));

        Assert.Equal(
            ["id", "stageId", "slot", "label", "status", "scheduledAt", "players", "questions",
             "assemblyRevision", "assembledAt"],
            KeysOf(wire));
        Assert.Equal("LIVE", wire.GetProperty("status").GetString());
        Assert.Equal(1, wire.GetProperty("players").GetArrayLength());
    }

    [Fact]
    public void MatchDetail_keeps_every_entity_key_and_adds_assemblyEvents()
    {
        var match = Match();
        var wire = Wire(MatchDetail.Of(match, []));

        Assert.Equal(
            ["id", "tournamentId", "stageId", "scheduledAt", "label", "status", "kind", "slot", "players",
             "roundConfigs", "questions", "assemblyRevision", "assembledAt", "controllerId",
             "controllerHeartbeatAt", "live", "discord", "createdAt", "updatedAt", "deletedAt",
             "assemblyEvents"],
            KeysOf(wire));
        Assert.Equal(match.Id, wire.GetProperty("id").GetGuid());
        Assert.Equal(0, wire.GetProperty("assemblyEvents").GetArrayLength());
    }

    [Fact]
    public void TournamentDetail_keeps_every_entity_key_and_adds_places()
    {
        var now = DateTime.UtcNow;
        var row = new TournamentEntity
        {
            Id = Guid.NewGuid(),
            Name = "Cup",
            Slug = "cup",
            Visibility = Visibility.PUBLIC,
            OwnerId = Guid.NewGuid(),
            Current = true,
            Rounds = JsonDefaults.Serialize(Array.Empty<TournamentRound>()),
            Format = JsonDefaults.Serialize(new TournamentFormat { CompetitorsPerMatch = 4 }),
            Stages = JsonDefaults.Serialize(Array.Empty<object>()),
            CreatedAt = now,
            UpdatedAt = now
        };

        var wire = Wire(TournamentDetail.Of(row, 7));

        Assert.Equal(
            ["id", "name", "slug", "visibility", "ownerId", "current", "rounds", "format", "stages",
             "roundRules", "closedAt", "createdAt", "updatedAt", "deletedAt", "places"],
            KeysOf(wire));
        Assert.Equal(7, wire.GetProperty("places").GetInt32());
        Assert.Equal(JsonValueKind.Object, wire.GetProperty("roundRules").ValueKind);
    }

    [DbFact]
    public async Task Match_list_never_ships_the_live_blob()
    {
        await AuthTestDb.EnsureSchemaAsync();
        using var db = AuthTestDb.OpenDb();

        var now = DateTime.UtcNow;
        var ownerId = Guid.NewGuid();
        var tournamentId = Guid.NewGuid();
        var matchId = Guid.NewGuid();

        db.Users.Add(new UserEntity
        {
            Id = ownerId,
            Role = UserRole.ADMIN,
            Username = "summary-" + Guid.NewGuid().ToString("N")[..8],
            DisplayName = "Owner",
            CreatedAt = now,
            UpdatedAt = now
        });
        await db.SaveChangesAsync();
        db.Tournaments.Add(new TournamentEntity
        {
            Id = tournamentId,
            Name = "Summary cup",
            Slug = Guid.NewGuid().ToString("N")[..12],
            Visibility = Visibility.PRIVATE,
            OwnerId = ownerId,
            Rounds = JsonDefaults.Serialize(Array.Empty<TournamentRound>()),
            Format = JsonDefaults.Serialize(new TournamentFormat { CompetitorsPerMatch = 4 }),
            Stages = JsonDefaults.Serialize(Array.Empty<object>()),
            CreatedAt = now,
            UpdatedAt = now
        });
        await db.SaveChangesAsync();
        db.Matches.Add(new MatchEntity
        {
            Id = matchId,
            TournamentId = tournamentId,
            StageId = "stage-1",
            ScheduledAt = now,
            Label = "Vòng 1",
            Status = MatchStatus.LIVE,
            Players = JsonDefaults.Serialize(Array.Empty<Seat>()),
            RoundConfigs = JsonDefaults.Serialize(new Dictionary<string, RoundConfig>()),
            Questions = JsonDefaults.Serialize(Array.Empty<MatchQuestion>()),
            Live = JsonDefaults.Serialize(new { stage = "giai-ma" }),
            CreatedAt = now,
            UpdatedAt = now
        });
        await db.SaveChangesAsync();

        var service = new MatchesService(
            db, new AOC.Api.Modules.Standings.StandingsService(db),
            Microsoft.Extensions.Logging.Abstractions.NullLogger<MatchesService>.Instance);
        var page = await service.ListMatchesAsync(tournamentId.ToString(), null, new Page(50, 0));

        var row = Assert.Single(page.Items);
        Assert.Equal(matchId, row.Id);
        var wire = Wire(row);
        Assert.DoesNotContain("live", KeysOf(wire));
        Assert.DoesNotContain("discord", KeysOf(wire));
    }
}
