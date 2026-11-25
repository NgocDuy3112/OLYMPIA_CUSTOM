using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using AOC.Api.Http;
using AOC.Api.Modules.Live;
using AOC.Api.Modules.Live.TieBreak;
using AOC.Api.Modules.Matches;
using AOC.Api.Modules.Questions;
using AOC.Api.Modules.Standings;
using AOC.Api.Realtime;
using AOC.Domain.Contracts;
using AOC.Domain.Gameplay;
using AOC.Infrastructure.Data;
using AOC.Infrastructure.Data.Entities;
using AOC.Tests.Auth;
using Xunit;

namespace AOC.Tests.Modules;

public class LiveMatchGuardTests
{
    private sealed record Seeded(Guid TournamentId, Guid MatchId);

    private static async Task<Seeded> SeedAsync(
        AOCDbContext db, Visibility visibility, Guid ownerId)
    {
        var now = DateTime.UtcNow;
        var tournamentId = Guid.NewGuid();
        var matchId = Guid.NewGuid();

        db.Users.Add(User(ownerId, UserRole.OPERATOR));
        await db.SaveChangesAsync();

        db.Tournaments.Add(new TournamentEntity
        {
            Id = tournamentId,
            Name = "Guard cup",
            Slug = Guid.NewGuid().ToString("N")[..12],
            Visibility = visibility,
            OwnerId = ownerId,
            Rounds = JsonDefaults.Serialize(Array.Empty<TournamentRound>()),
            Format = JsonDefaults.Serialize(new { }),
            Stages = JsonDefaults.Serialize(Array.Empty<object>()),
            CreatedAt = now,
            UpdatedAt = now
        });
        await db.SaveChangesAsync();

        db.Matches.Add(new MatchEntity
        {
            Id = matchId,
            TournamentId = tournamentId,
            StageId = "s1",
            ScheduledAt = now,
            Label = "Vòng 1",
            Status = MatchStatus.LIVE,
            Players = JsonDefaults.Serialize(Array.Empty<Seat>()),
            RoundConfigs = JsonDefaults.Serialize(new Dictionary<string, RoundConfig>()),
            Questions = JsonDefaults.Serialize(Array.Empty<MatchQuestion>()),
            CreatedAt = now,
            UpdatedAt = now
        });
        await db.SaveChangesAsync();

        return new Seeded(tournamentId, matchId);
    }

    private static async Task RemoveAsync(AOCDbContext db, Seeded seeded)
    {
        db.Matches.RemoveRange(db.Matches.Where(m => m.Id == seeded.MatchId));
        var ownerId = await db.Tournaments
            .Where(t => t.Id == seeded.TournamentId)
            .Select(t => t.OwnerId)
            .FirstOrDefaultAsync();
        db.Tournaments.RemoveRange(db.Tournaments.Where(t => t.Id == seeded.TournamentId));
        await db.SaveChangesAsync();
        db.Users.RemoveRange(db.Users.Where(u => u.Id == ownerId));
        await db.SaveChangesAsync();
    }

    private static HttpContext ContextFor(AOCDbContext db)
    {
        var hub = new MatchHubRegistry(NullLogger<MatchHubRegistry>.Instance);
        var matches = new MatchesService(
            db, new StandingsService(db), NullLogger<MatchesService>.Instance);
        var reader = new LiveReader(db);
        var tieBreak = new TieBreakService(
            db, matches, new QuestionsService(db), reader, hub);

        var services = new ServiceCollection();
        services.AddSingleton(db);
        services.AddSingleton(matches);
        services.AddSingleton(tieBreak);
        services.AddSingleton(hub);
        services.AddSingleton(sp => new LiveService(
            db, reader, hub, matches,
            sp.GetRequiredService<TieBreakService>(), NullLogger<LiveService>.Instance));

        return new DefaultHttpContext { RequestServices = services.BuildServiceProvider() };
    }

    private static UserEntity User(Guid id, UserRole role) => new()
    {
        Id = id,
        Role = role,
        Username = "u",
        DisplayName = "U",
    };

    private static async Task<ApiException> CaptureAsync(Func<Task> fn)
    {
        try
        {
            await fn();
        }
        catch (ApiException ex)
        {
            return ex;
        }
        throw new InvalidOperationException("expected an ApiException");
    }

    [DbFact]
    public async Task A_match_from_another_tournament_is_not_found()
    {
        await AuthTestDb.EnsureSchemaAsync();
        var db = AuthTestDb.OpenDb();
        var owner = Guid.NewGuid();
        var seeded = await SeedAsync(db, Visibility.PUBLIC, owner);
        var otherTournamentId = Guid.NewGuid();

        try
        {
            var http = ContextFor(db);
            var error = await CaptureAsync(() => LiveMatchGuard.RequirePairAsync(
                http, otherTournamentId.ToString(), seeded.MatchId.ToString()));

            Assert.Equal(404, error.Status);
        }
        finally
        {
            await RemoveAsync(db, seeded);
        }
    }

    [DbFact]
    public async Task A_matching_pair_is_returned()
    {
        await AuthTestDb.EnsureSchemaAsync();
        var db = AuthTestDb.OpenDb();
        var owner = Guid.NewGuid();
        var seeded = await SeedAsync(db, Visibility.PUBLIC, owner);

        try
        {
            var http = ContextFor(db);
            var match = await LiveMatchGuard.RequirePairAsync(
                http, seeded.TournamentId.ToString(), seeded.MatchId.ToString());

            Assert.Equal(seeded.MatchId, match.Id);
        }
        finally
        {
            await RemoveAsync(db, seeded);
        }
    }

    [DbFact]
    public async Task Portal_live_hides_a_private_tournament_from_a_stranger()
    {
        await AuthTestDb.EnsureSchemaAsync();
        var db = AuthTestDb.OpenDb();
        var owner = Guid.NewGuid();
        var seeded = await SeedAsync(db, Visibility.PRIVATE, owner);
        var stranger = User(Guid.NewGuid(), UserRole.OPERATOR);

        try
        {
            var http = ContextFor(db);
            var error = await CaptureAsync(() => LiveMatchGuard.RequirePortalAsync(
                http, seeded.TournamentId.ToString(), seeded.MatchId.ToString(), stranger));

            Assert.Equal(404, error.Status);
        }
        finally
        {
            await RemoveAsync(db, seeded);
        }
    }

    [DbFact]
    public async Task Portal_live_shows_a_private_tournament_to_its_owner()
    {
        await AuthTestDb.EnsureSchemaAsync();
        var db = AuthTestDb.OpenDb();
        var ownerId = Guid.NewGuid();
        var seeded = await SeedAsync(db, Visibility.PRIVATE, ownerId);
        var owner = User(ownerId, UserRole.OPERATOR);

        try
        {
            var http = ContextFor(db);
            var match = await LiveMatchGuard.RequirePortalAsync(
                http, seeded.TournamentId.ToString(), seeded.MatchId.ToString(), owner);

            Assert.Equal(seeded.MatchId, match.Id);
        }
        finally
        {
            await RemoveAsync(db, seeded);
        }
    }

    [DbFact]
    public async Task Spectate_live_hides_a_private_tournament()
    {
        await AuthTestDb.EnsureSchemaAsync();
        var db = AuthTestDb.OpenDb();
        var seeded = await SeedAsync(db, Visibility.PRIVATE, Guid.NewGuid());

        try
        {
            var http = ContextFor(db);
            var error = await CaptureAsync(() => LiveMatchGuard.RequireSpectatableAsync(
                http, seeded.TournamentId.ToString(), seeded.MatchId.ToString()));

            Assert.Equal(404, error.Status);
        }
        finally
        {
            await RemoveAsync(db, seeded);
        }
    }

    [DbFact]
    public async Task Spectate_live_shows_a_public_tournament()
    {
        await AuthTestDb.EnsureSchemaAsync();
        var db = AuthTestDb.OpenDb();
        var seeded = await SeedAsync(db, Visibility.PUBLIC, Guid.NewGuid());

        try
        {
            var http = ContextFor(db);
            var match = await LiveMatchGuard.RequireSpectatableAsync(
                http, seeded.TournamentId.ToString(), seeded.MatchId.ToString());

            Assert.Equal(seeded.MatchId, match.Id);
        }
        finally
        {
            await RemoveAsync(db, seeded);
        }
    }

    [DbFact]
    public async Task The_audience_view_drops_answer_values_the_console_keeps()
    {
        await AuthTestDb.EnsureSchemaAsync();
        var db = AuthTestDb.OpenDb();
        var seeded = await SeedAsync(db, Visibility.PUBLIC, Guid.NewGuid());
        var now = DateTime.UtcNow;

        try
        {
            db.MatchLive.Add(new MatchLiveEntity
            {
                MatchId = seeded.MatchId,
                Version = 1,
                RoundId = "khoi-dong",
                State = JsonSerializer.SerializeToElement(new { waiting = true }, JsonApi.Options),
                Archive = JsonSerializer.SerializeToElement(
                    new Dictionary<string, JsonElement>(), JsonApi.Options),
                UpdatedAt = now
            });
            await db.SaveChangesAsync();

            var service = ContextFor(db).RequestServices.GetRequiredService<LiveService>();
            var console = await service.ConsoleViewOfAsync(seeded.MatchId);
            var audience = await service.AudienceViewOfAsync(seeded.MatchId);

            Assert.NotNull(console);
            Assert.True(console.Projection.ContainsKey("answers"));
            Assert.NotNull(audience);
            Assert.False(audience.Projection.ContainsKey("answers"));
        }
        finally
        {
            db.MatchLive.RemoveRange(db.MatchLive.Where(l => l.MatchId == seeded.MatchId));
            await db.SaveChangesAsync();
            await RemoveAsync(db, seeded);
        }
    }
}
