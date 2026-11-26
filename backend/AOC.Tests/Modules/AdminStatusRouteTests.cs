using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using AOC.Api.Modules.Admin;
using AOC.Infrastructure.Auth;
using AOC.Infrastructure.Configuration;
using AOC.Infrastructure.Data;
using AOC.Infrastructure.Data.Entities;
using AOC.Tests.Auth;
using Xunit;

namespace AOC.Tests.Modules;

public class AdminStatusRouteTests : IDisposable
{
    private sealed record Seeded(WebApplication App, Guid AdminId, Guid OperatorId);

    private readonly AOCDbContext db = AuthTestDb.OpenDb();

    private async Task<Seeded> SeedAsync()
    {
        await AuthTestDb.EnsureSchemaAsync();
        var admin = new UserEntity
        {
            Id = Guid.NewGuid(),
            Role = UserRole.ADMIN,
            Username = "route-admin-" + Guid.NewGuid().ToString("N")[..8],
            DisplayName = "Admin",
            TokenVersion = 2,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };
        var op = new UserEntity
        {
            Id = Guid.NewGuid(),
            Role = UserRole.OPERATOR,
            Username = "route-operator-" + Guid.NewGuid().ToString("N")[..8],
            DisplayName = "Operator",
            TokenVersion = 4,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };
        db.Users.AddRange(admin, op);
        await db.SaveChangesAsync();

        var builder = WebApplication.CreateBuilder();
        builder.Services.AddSingleton(db);
        builder.Services.AddSingleton(new SessionTokens());
        builder.Services.AddScoped<AccountStatusService>();
        builder.Services.AddScoped<AOC.Infrastructure.Audit.AuditService>();

        var app = builder.Build();
        app.MapAdminRoutes();
        return new Seeded(app, admin.Id, op.Id);
    }

    private static RouteEndpoint EndpointOf(WebApplication app, string pattern)
        => ((IEndpointRouteBuilder)app).DataSources
            .SelectMany(source => source.Endpoints)
            .OfType<RouteEndpoint>()
            .Single(endpoint => endpoint.RoutePattern.RawText == pattern);

    private static async Task<(int Status, JsonElement Body)> SendAsync(
        WebApplication app, RouteEndpoint endpoint, Guid sessionUserId, int tokenVersion,
        Guid targetUserId, string body)
    {
        var token = new SessionTokens().SignSession(Surface.PORTAL,
            new SessionTokenPayload(sessionUserId.ToString(), "ADMIN", tokenVersion));

        var http = new DefaultHttpContext { RequestServices = app.Services };
        http.Request.Method = "PATCH";
        http.Request.Path = endpoint.RoutePattern.RawText!.Replace("{userId}", targetUserId.ToString());
        http.Request.RouteValues["userId"] = targetUserId.ToString();
        http.Request.Body = new MemoryStream(Encoding.UTF8.GetBytes(body));
        http.Request.Headers.Cookie = $"{CookieNames.For(Surface.PORTAL)}={token}";
        http.Response.Body = new MemoryStream();

        await endpoint.RequestDelegate!(http);

        http.Response.Body.Position = 0;
        using var document = await JsonDocument.ParseAsync(http.Response.Body);
        return (http.Response.StatusCode, document.RootElement.Clone());
    }

    [DbFact]
    public async Task Operator_status_route_answers_with_the_account_body()
    {
        var seeded = await SeedAsync();
        try
        {
            var (status, body) = await SendAsync(seeded.App, EndpointOf(seeded.App,
                    "/portal/operators/{userId}/status"), seeded.AdminId, 2, seeded.OperatorId,
                """{"disabled":true}""");

            Assert.Equal(200, status);
            Assert.Equal(
                ["userId", "username", "displayName", "role", "disabledAt", "createdAt"],
                body.EnumerateObject().Select(property => property.Name));
            Assert.Equal(seeded.OperatorId, body.GetProperty("userId").GetGuid());
            Assert.Equal("OPERATOR", body.GetProperty("role").GetString());
            Assert.Equal(JsonValueKind.String, body.GetProperty("disabledAt").ValueKind);
        }
        finally
        {
            await seeded.App.DisposeAsync();
        }
    }

    [DbFact]
    public async Task Player_status_route_answers_with_the_account_body()
    {
        var seeded = await SeedAsync();
        try
        {
            var player = new UserEntity
            {
                Id = Guid.NewGuid(),
                Role = UserRole.PLAYER,
                Username = "route-player-" + Guid.NewGuid().ToString("N")[..8],
                DisplayName = "Player",
                TokenVersion = 1,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };
            db.Users.Add(player);
            await db.SaveChangesAsync();

            var (status, body) = await SendAsync(seeded.App, EndpointOf(seeded.App,
                    "/portal/players/{userId}/status"), seeded.AdminId, 2, player.Id,
                """{"disabled":false}""");

            Assert.Equal(200, status);
            Assert.Equal(player.Id, body.GetProperty("userId").GetGuid());
            Assert.Equal("PLAYER", body.GetProperty("role").GetString());
            Assert.Equal(JsonValueKind.Null, body.GetProperty("disabledAt").ValueKind);
        }
        finally
        {
            await seeded.App.DisposeAsync();
        }
    }

    public void Dispose() => db.Dispose();
}
