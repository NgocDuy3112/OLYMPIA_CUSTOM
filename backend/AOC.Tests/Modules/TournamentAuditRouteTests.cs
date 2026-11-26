using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using AOC.Api.Modules.Tournaments;
using AOC.Domain.Contracts;
using AOC.Infrastructure.Auth;
using AOC.Infrastructure.Configuration;
using AOC.Infrastructure.Data;
using AOC.Infrastructure.Data.Entities;
using AOC.Tests.Auth;
using Xunit;

namespace AOC.Tests.Modules;

public class TournamentAuditRouteTests : IDisposable
{
    private sealed record Seeded(WebApplication App, Guid AdminId, Guid TournamentId);

    private const string ClosePattern = "/portal/tournaments/{tournamentId}/close";
    private const string DeletePattern = "/portal/tournaments/{tournamentId}";

    private readonly AOCDbContext db = AuthTestDb.OpenDb();

    private async Task<Seeded> SeedAsync(string name, UserRole role)
    {
        await AuthTestDb.EnsureSchemaAsync();
        var now = DateTime.UtcNow;
        var owner = new UserEntity
        {
            Id = Guid.NewGuid(),
            Role = role,
            Username = "audit-owner-" + Guid.NewGuid().ToString("N")[..8],
            DisplayName = "Owner",
            TokenVersion = 1,
            CreatedAt = now,
            UpdatedAt = now
        };
        db.Users.Add(owner);
        await db.SaveChangesAsync();

        var tournamentId = Guid.NewGuid();
        db.Tournaments.Add(new TournamentEntity
        {
            Id = tournamentId,
            Name = name,
            Slug = Guid.NewGuid().ToString("N")[..12],
            Visibility = Visibility.PRIVATE,
            OwnerId = owner.Id,
            Current = true,
            Rounds = JsonDefaults.Serialize(Array.Empty<TournamentRound>()),
            Format = JsonDefaults.Serialize(new TournamentFormat { CompetitorsPerMatch = 4 }),
            Stages = JsonDefaults.Serialize(Array.Empty<object>()),
            CreatedAt = now,
            UpdatedAt = now
        });
        await db.SaveChangesAsync();

        var builder = WebApplication.CreateBuilder();
        builder.Services.AddSingleton(db);
        builder.Services.AddSingleton(new SessionTokens());
        builder.Services.AddScoped<TournamentsService>();
        builder.Services.AddScoped<AOC.Infrastructure.Audit.AuditService>();

        var app = builder.Build();
        app.MapTournamentRoutes();
        return new Seeded(app, owner.Id, tournamentId);
    }

    private static RouteEndpoint EndpointOf(WebApplication app, string method, string pattern)
        => ((IEndpointRouteBuilder)app).DataSources
            .SelectMany(source => source.Endpoints)
            .OfType<RouteEndpoint>()
            .Single(endpoint => endpoint.RoutePattern.RawText == pattern
                                && endpoint.Metadata.GetMetadata<HttpMethodMetadata>()!
                                    .HttpMethods.Contains(method));

    private static DefaultHttpContext ContextFor(
        WebApplication app, Seeded seeded, string method, string role)
    {
        var token = new SessionTokens().SignSession(Surface.PORTAL,
            new SessionTokenPayload(seeded.AdminId.ToString(), role, 1));

        var http = new DefaultHttpContext { RequestServices = app.Services };
        http.Request.Method = method;
        http.Request.RouteValues["tournamentId"] = seeded.TournamentId.ToString();
        http.Request.Headers.Cookie = $"{CookieNames.For(Surface.PORTAL)}={token}";
        http.Response.Body = new MemoryStream();
        return http;
    }

    [DbFact]
    public async Task Closing_a_tournament_leaves_a_tournament_closed_row()
    {
        var seeded = await SeedAsync("Close cup", UserRole.OPERATOR);
        try
        {
            var http = ContextFor(seeded.App, seeded, "POST", "OPERATOR");
            await EndpointOf(seeded.App, "POST", ClosePattern).RequestDelegate!(http);

            Assert.Equal(200, http.Response.StatusCode);
            var row = await db.AuditEvents.AsNoTracking()
                .SingleAsync(e => e.Action == "tournament_closed"
                                  && e.Details!.Value.GetProperty("tournamentId").GetGuid()
                                      == seeded.TournamentId);
            Assert.Equal(seeded.AdminId, row.ActorId);
            Assert.Equal("Close cup", row.Details!.Value.GetProperty("name").GetString());
            Assert.Equal(System.Text.Json.JsonValueKind.String,
                row.Details.Value.GetProperty("closedAt").ValueKind);
        }
        finally
        {
            await seeded.App.DisposeAsync();
        }
    }

    [DbFact]
    public async Task Deleting_a_tournament_leaves_a_tournament_deleted_row()
    {
        var seeded = await SeedAsync("Delete cup", UserRole.ADMIN);
        try
        {
            var http = ContextFor(seeded.App, seeded, "DELETE", "ADMIN");
            await EndpointOf(seeded.App, "DELETE", DeletePattern).RequestDelegate!(http);

            Assert.Equal(204, http.Response.StatusCode);
            var row = await db.AuditEvents.AsNoTracking()
                .SingleAsync(e => e.Action == "tournament_deleted"
                                  && e.Details!.Value.GetProperty("tournamentId").GetGuid()
                                      == seeded.TournamentId);
            Assert.Equal(seeded.AdminId, row.ActorId);
            Assert.Equal("Delete cup", row.Details!.Value.GetProperty("name").GetString());
        }
        finally
        {
            await seeded.App.DisposeAsync();
        }
    }

    public void Dispose() => db.Dispose();
}
