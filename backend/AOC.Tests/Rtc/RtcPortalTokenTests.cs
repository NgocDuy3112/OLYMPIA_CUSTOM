using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using AOC.Api.Http;
using AOC.Api.Modules.Matches;
using AOC.Api.Modules.Rtc;
using AOC.Infrastructure.Auth;
using AOC.Infrastructure.Configuration;
using AOC.Domain.Contracts;
using AOC.Infrastructure.Data;
using AOC.Infrastructure.Data.Entities;
using AOC.Tests.Auth;
using Xunit;

namespace AOC.Tests.Rtc;

public class RtcPortalTokenTests : IDisposable
{
    private sealed record Seeded(WebApplication App, Guid OwnerId, Guid StrangerId,
        Guid TournamentId, Guid MatchId);

    private const string Pattern =
        "/portal/tournaments/{tournamentId}/matches/{matchId}/rtc/token";

    private readonly AOCDbContext db = AuthTestDb.OpenDb();

    private async Task<Seeded> SeedAsync()
    {
        await AuthTestDb.EnsureSchemaAsync();
        var now = DateTime.UtcNow;
        var owner = new UserEntity
        {
            Id = Guid.NewGuid(),
            Role = UserRole.OPERATOR,
            Username = "rtc-owner-" + Guid.NewGuid().ToString("N")[..8],
            DisplayName = "Owner",
            TokenVersion = 1,
            CreatedAt = now,
            UpdatedAt = now
        };
        var stranger = new UserEntity
        {
            Id = Guid.NewGuid(),
            Role = UserRole.OPERATOR,
            Username = "rtc-stranger-" + Guid.NewGuid().ToString("N")[..8],
            DisplayName = "Stranger",
            TokenVersion = 1,
            CreatedAt = now,
            UpdatedAt = now
        };
        db.Users.AddRange(owner, stranger);
        await db.SaveChangesAsync();

        var tournamentId = Guid.NewGuid();
        db.Tournaments.Add(new TournamentEntity
        {
            Id = tournamentId,
            Name = "RTC cup",
            Slug = Guid.NewGuid().ToString("N")[..12],
            Visibility = Visibility.PUBLIC,
            OwnerId = owner.Id,
            Rounds = JsonDefaults.Serialize(Array.Empty<TournamentRound>()),
            Format = JsonDefaults.Serialize(new { }),
            Stages = JsonDefaults.Serialize(Array.Empty<object>()),
            CreatedAt = now,
            UpdatedAt = now
        });
        await db.SaveChangesAsync();

        var matchId = Guid.NewGuid();
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

        var builder = WebApplication.CreateBuilder();
        builder.Services.AddSingleton(db);
        builder.Services.AddSingleton(new SessionTokens());
        builder.Services.AddScoped<MatchesService>();
        builder.Services.AddScoped<MatchAssemblyService>();

        var app = builder.Build();
        app.MapRtcRoutes();
        return new Seeded(app, owner.Id, stranger.Id, tournamentId, matchId);
    }

    private static RouteEndpoint EndpointOf(WebApplication app)
        => ((IEndpointRouteBuilder)app).DataSources
            .SelectMany(source => source.Endpoints)
            .OfType<RouteEndpoint>()
            .Single(endpoint => endpoint.RoutePattern.RawText == Pattern);

    private static DefaultHttpContext ContextFor(WebApplication app, Seeded seeded, Guid userId)
    {
        var token = new SessionTokens().SignSession(Surface.PORTAL,
            new SessionTokenPayload(userId.ToString(), "OPERATOR", 1));

        var http = new DefaultHttpContext { RequestServices = app.Services };
        http.Request.Method = "POST";
        http.Request.Path = Pattern
            .Replace("{tournamentId}", seeded.TournamentId.ToString())
            .Replace("{matchId}", seeded.MatchId.ToString());
        http.Request.RouteValues["tournamentId"] = seeded.TournamentId.ToString();
        http.Request.RouteValues["matchId"] = seeded.MatchId.ToString();
        http.Request.Headers.Cookie = $"{CookieNames.For(Surface.PORTAL)}={token}";
        http.Response.Body = new MemoryStream();
        return http;
    }

    [DbFact]
    public async Task An_operator_without_write_access_cannot_mint_a_portal_token()
    {
        var seeded = await SeedAsync();
        try
        {
            var http = ContextFor(seeded.App, seeded, seeded.StrangerId);
            var error = await Assert.ThrowsAsync<ApiException>(
                () => EndpointOf(seeded.App).RequestDelegate!(http));

            Assert.Equal(403, error.Status);
        }
        finally
        {
            await seeded.App.DisposeAsync();
        }
    }

    [DbFact]
    public async Task The_tournament_owner_gets_an_operator_token()
    {
        var seeded = await SeedAsync();
        try
        {
            var http = ContextFor(seeded.App, seeded, seeded.OwnerId);
            await EndpointOf(seeded.App).RequestDelegate!(http);

            http.Response.Body.Position = 0;
            using var document = await JsonDocument.ParseAsync(http.Response.Body);
            var body = document.RootElement;

            Assert.Equal(200, http.Response.StatusCode);
            Assert.Equal(seeded.MatchId.ToString(), body.GetProperty("room").GetString());
            Assert.Equal(seeded.OwnerId.ToString(), body.GetProperty("identity").GetString());
            Assert.False(string.IsNullOrEmpty(body.GetProperty("token").GetString()));
        }
        finally
        {
            await seeded.App.DisposeAsync();
        }
    }

    public void Dispose() => db.Dispose();
}
