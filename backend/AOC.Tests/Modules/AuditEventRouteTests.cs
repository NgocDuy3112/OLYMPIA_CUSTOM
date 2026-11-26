using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using AOC.Api.Http;
using AOC.Api.Modules.Audit;
using AOC.Infrastructure.Auth;
using AOC.Infrastructure.Configuration;
using AOC.Infrastructure.Data;
using AOC.Infrastructure.Data.Entities;
using AOC.Tests.Auth;
using Xunit;

namespace AOC.Tests.Modules;

public class AuditEventRouteTests : IDisposable
{
    private sealed record Seeded(WebApplication App, Guid AdminId, Guid OperatorId, string OperatorUsername);

    private static readonly string[] AllEndpoints =
    [
        "/portal/audit-events",
        "/portal/audit-events/actions",
        "/portal/audit-events/export"
    ];

    private readonly AOCDbContext db = AuthTestDb.OpenDb();

    private async Task<Seeded> SeedAppAsync()
    {
        await AuthTestDb.EnsureSchemaAsync();
        var now = DateTime.UtcNow;
        var admin = new UserEntity
        {
            Id = Guid.NewGuid(),
            Role = UserRole.ADMIN,
            Username = "audit-admin-" + Guid.NewGuid().ToString("N")[..8],
            DisplayName = "Audit Admin",
            TokenVersion = 1,
            CreatedAt = now,
            UpdatedAt = now
        };
        var operatorUsername = "audit-operator-" + Guid.NewGuid().ToString("N")[..8];
        var op = new UserEntity
        {
            Id = Guid.NewGuid(),
            Role = UserRole.OPERATOR,
            Username = operatorUsername,
            DisplayName = "Audit Operator",
            TokenVersion = 1,
            CreatedAt = now,
            UpdatedAt = now
        };
        db.Users.AddRange(admin, op);
        await db.SaveChangesAsync();

        var builder = WebApplication.CreateBuilder();
        builder.Services.AddSingleton(db);
        builder.Services.AddSingleton(new SessionTokens());
        builder.Services.AddScoped<AuditEventStore>();
        builder.Services.AddScoped<AuditEventsService>();

        var app = builder.Build();
        app.MapAuditRoutes();
        return new Seeded(app, admin.Id, op.Id, operatorUsername);
    }

    private Guid AddAudit(string action, DateTime createdAt, Guid? actorId = null,
        Guid? targetId = null, string? ip = null, string? userAgent = null, object? details = null)
    {
        var id = Guid.NewGuid();
        db.AuditEvents.Add(new AuditEventEntity
        {
            Id = id,
            Action = action,
            ActorId = actorId,
            TargetId = targetId,
            CreatedAt = createdAt,
            Ip = ip,
            UserAgent = userAgent,
            Details = details is null ? null : JsonSerializer.SerializeToElement(details)
        });
        return id;
    }

    private static RouteEndpoint EndpointOf(WebApplication app, string pattern)
        => ((IEndpointRouteBuilder)app).DataSources
            .SelectMany(source => source.Endpoints)
            .OfType<RouteEndpoint>()
            .Single(endpoint => endpoint.RoutePattern.RawText == pattern);

    private static DefaultHttpContext ContextFor(Seeded seeded, string pattern, string? role,
        string query = "")
    {
        var http = new DefaultHttpContext { RequestServices = seeded.App.Services };
        http.Request.Method = "GET";
        http.Request.Path = pattern;
        http.Request.QueryString = new QueryString(query.Length == 0 ? "" : "?" + query);
        if (role is not null)
        {
            var userId = role == "ADMIN" ? seeded.AdminId : seeded.OperatorId;
            var token = new SessionTokens().SignSession(Surface.PORTAL,
                new SessionTokenPayload(userId.ToString(), role, 1));
            http.Request.Headers.Cookie = $"{CookieNames.For(Surface.PORTAL)}={token}";
        }
        http.Response.Body = new MemoryStream();
        return http;
    }

    private static async Task<DefaultHttpContext> SendAsync(
        Seeded seeded, string pattern, string? role, string query = "")
    {
        var http = ContextFor(seeded, pattern, role, query);
        await EndpointOf(seeded.App, pattern).RequestDelegate!(http);
        http.Response.Body.Position = 0;
        return http;
    }

    private static async Task<JsonElement> BodyJsonAsync(DefaultHttpContext http)
    {
        using var document = await JsonDocument.ParseAsync(http.Response.Body);
        return document.RootElement.Clone();
    }

    [DbFact]
    public async Task Every_audit_endpoint_requires_a_portal_session()
    {
        var seeded = await SeedAppAsync();
        try
        {
            foreach (var pattern in AllEndpoints)
            {
                var ex = await Assert.ThrowsAsync<ApiException>(() => SendAsync(seeded, pattern, null));
                Assert.Equal(401, ex.Status);
            }
        }
        finally
        {
            await seeded.App.DisposeAsync();
        }
    }

    [DbFact]
    public async Task Every_audit_endpoint_answers_admins()
    {
        var seeded = await SeedAppAsync();
        try
        {
            foreach (var pattern in AllEndpoints)
            {
                var http = await SendAsync(seeded, pattern, "ADMIN");
                Assert.Equal(200, http.Response.StatusCode);
            }
        }
        finally
        {
            await seeded.App.DisposeAsync();
        }
    }

    [DbFact]
    public async Task Every_audit_endpoint_rejects_operators()
    {
        var seeded = await SeedAppAsync();
        try
        {
            foreach (var pattern in AllEndpoints)
            {
                var ex = await Assert.ThrowsAsync<ApiException>(() => SendAsync(seeded, pattern, "OPERATOR"));
                Assert.Equal(403, ex.Status);
            }
        }
        finally
        {
            await seeded.App.DisposeAsync();
        }
    }

    [DbFact]
    public async Task Admin_reads_events_newest_first_and_pages_them()
    {
        var seeded = await SeedAppAsync();
        try
        {
            var baseTime = new DateTime(2026, 11, 26, 12, 0, 0, DateTimeKind.Utc);
            AddAudit("account_enabled", baseTime.AddMinutes(1), actorId: seeded.AdminId);
            AddAudit("account_disabled", baseTime.AddMinutes(2), actorId: seeded.AdminId);
            AddAudit("mcp_key_issued", baseTime.AddMinutes(3), actorId: seeded.AdminId);
            await db.SaveChangesAsync();

            var first = await BodyJsonAsync(await SendAsync(seeded, AllEndpoints[0], "ADMIN", "limit=2&offset=0&actorId=" + seeded.AdminId));
            Assert.Equal(3, first.GetProperty("total").GetInt32());
            Assert.Equal(2, first.GetProperty("limit").GetInt32());
            Assert.Equal(0, first.GetProperty("offset").GetInt32());
            Assert.Equal(["mcp_key_issued", "account_disabled"],
                first.GetProperty("items").EnumerateArray().Select(row => row.GetProperty("action").GetString()));

            var second = await BodyJsonAsync(await SendAsync(seeded, AllEndpoints[0], "ADMIN", "limit=2&offset=2&actorId=" + seeded.AdminId));
            Assert.Equal(["account_enabled"],
                second.GetProperty("items").EnumerateArray().Select(row => row.GetProperty("action").GetString()));
        }
        finally
        {
            await seeded.App.DisposeAsync();
        }
    }

    [DbFact]
    public async Task Admin_filters_events_by_action_actor_and_created_range()
    {
        var seeded = await SeedAppAsync();
        try
        {
            var baseTime = new DateTime(2026, 11, 26, 12, 0, 0, DateTimeKind.Utc);
            AddAudit("account_enabled", baseTime, actorId: seeded.AdminId, targetId: seeded.OperatorId);
            AddAudit("account_disabled", baseTime.AddMinutes(5), actorId: seeded.OperatorId);
            AddAudit("mcp_key_issued", baseTime.AddMinutes(10), actorId: seeded.AdminId);
            await db.SaveChangesAsync();

            var byActions = await BodyJsonAsync(await SendAsync(seeded, AllEndpoints[0], "ADMIN",
                "action=account_enabled,mcp_key_issued&actorId=" + seeded.AdminId));
            Assert.Equal(["mcp_key_issued", "account_enabled"],
                byActions.GetProperty("items").EnumerateArray().Select(row => row.GetProperty("action").GetString()));

            var byActor = await BodyJsonAsync(await SendAsync(seeded, AllEndpoints[0], "ADMIN",
                "actorId=" + seeded.OperatorId));
            Assert.Equal(["account_disabled"],
                byActor.GetProperty("items").EnumerateArray().Select(row => row.GetProperty("action").GetString()));

            var byTarget = await BodyJsonAsync(await SendAsync(seeded, AllEndpoints[0], "ADMIN",
                "targetId=" + seeded.OperatorId));
            Assert.Equal(["account_enabled"],
                byTarget.GetProperty("items").EnumerateArray().Select(row => row.GetProperty("action").GetString()));

            var byRange = await BodyJsonAsync(await SendAsync(seeded, AllEndpoints[0], "ADMIN",
                "from=2026-11-26T12:01:00Z&to=2026-11-26T12:06:00Z&actorId=" + seeded.OperatorId));
            Assert.Equal(["account_disabled"],
                byRange.GetProperty("items").EnumerateArray().Select(row => row.GetProperty("action").GetString()));
        }
        finally
        {
            await seeded.App.DisposeAsync();
        }
    }

    [DbFact]
    public async Task Admin_search_matches_details_and_actor_names()
    {
        var seeded = await SeedAppAsync();
        try
        {
            var baseTime = new DateTime(2026, 11, 26, 12, 0, 0, DateTimeKind.Utc);
            var token = "zz-" + Guid.NewGuid().ToString("N");
            AddAudit("mcp_key_issued", baseTime.AddMinutes(1), actorId: seeded.AdminId,
                details: new { tool = token });
            AddAudit("account_disabled", baseTime.AddMinutes(2), actorId: seeded.OperatorId);
            await db.SaveChangesAsync();

            var byDetails = await BodyJsonAsync(await SendAsync(seeded, AllEndpoints[0], "ADMIN",
                "q=" + token));
            Assert.Equal(["mcp_key_issued"],
                byDetails.GetProperty("items").EnumerateArray().Select(row => row.GetProperty("action").GetString()));

            var byUsername = await BodyJsonAsync(await SendAsync(seeded, AllEndpoints[0], "ADMIN",
                "q=" + seeded.OperatorUsername));
            Assert.Equal(["account_disabled"],
                byUsername.GetProperty("items").EnumerateArray().Select(row => row.GetProperty("action").GetString()));
        }
        finally
        {
            await seeded.App.DisposeAsync();
        }
    }

    [DbFact]
    public async Task Admin_search_matches_terms_inside_nested_details_json()
    {
        var seeded = await SeedAppAsync();
        try
        {
            var baseTime = new DateTime(2026, 11, 26, 12, 0, 0, DateTimeKind.Utc);
            var token = "zz-nested-" + Guid.NewGuid().ToString("N");
            AddAudit("question_updated", baseTime.AddMinutes(1),
                details: new { nested = new { note = token } });
            AddAudit("question_deleted", baseTime.AddMinutes(2));
            await db.SaveChangesAsync();

            var byDetails = await BodyJsonAsync(await SendAsync(seeded, AllEndpoints[0], "ADMIN",
                "q=" + token));
            Assert.Equal(["question_updated"],
                byDetails.GetProperty("items").EnumerateArray().Select(row => row.GetProperty("action").GetString()));
        }
        finally
        {
            await seeded.App.DisposeAsync();
        }
    }

    [DbFact]
    public async Task Admin_rows_join_actor_and_target_display_names()
    {
        var seeded = await SeedAppAsync();
        try
        {
            var baseTime = new DateTime(2026, 11, 26, 12, 0, 0, DateTimeKind.Utc);
            AddAudit("player_updated", baseTime, actorId: seeded.AdminId, targetId: seeded.OperatorId);
            await db.SaveChangesAsync();

            var body = await BodyJsonAsync(await SendAsync(seeded, AllEndpoints[0], "ADMIN", "actorId=" + seeded.AdminId));
            var row = body.GetProperty("items").EnumerateArray().Single();
            Assert.Equal("Audit Admin", row.GetProperty("actorName").GetString());
            Assert.Equal("Audit Operator", row.GetProperty("targetName").GetString());
            Assert.Equal(seeded.AdminId, row.GetProperty("actorId").GetGuid());
        }
        finally
        {
            await seeded.App.DisposeAsync();
        }
    }

    [DbFact]
    public async Task Admin_reads_distinct_actions_sorted()
    {
        var seeded = await SeedAppAsync();
        try
        {
            var baseTime = new DateTime(2026, 11, 26, 12, 0, 0, DateTimeKind.Utc);
            var marker = "zz-action-" + Guid.NewGuid().ToString("N");
            AddAudit(marker + "_b", baseTime);
            AddAudit(marker + "_b", baseTime.AddMinutes(1));
            AddAudit(marker + "_a", baseTime.AddMinutes(2));
            await db.SaveChangesAsync();

            var body = await BodyJsonAsync(await SendAsync(seeded, AllEndpoints[1], "ADMIN"));
            var actions = body.GetProperty("actions").EnumerateArray()
                .Select(action => action.GetString()!).ToList();

            Assert.Equal([marker + "_a", marker + "_b"],
                actions.Where(action => action.StartsWith(marker)));
            Assert.Equal(actions.Distinct().Count(), actions.Count);
        }
        finally
        {
            await seeded.App.DisposeAsync();
        }
    }

    [DbFact]
    public async Task Admin_export_returns_a_csv_attachment_ignoring_paging()
    {
        var seeded = await SeedAppAsync();
        try
        {
            var baseTime = new DateTime(2026, 11, 26, 12, 0, 0, DateTimeKind.Utc);
            AddAudit("account_enabled", baseTime, actorId: seeded.AdminId,
                userAgent: "=cmd,evil");
            AddAudit("account_disabled", baseTime.AddMinutes(1), actorId: seeded.AdminId,
                userAgent: "Mozilla/5.0 (\"quoted\")");
            await db.SaveChangesAsync();

            var http = await SendAsync(seeded, AllEndpoints[2], "ADMIN",
                "actorId=" + seeded.AdminId + "&limit=1");
            Assert.Equal(200, http.Response.StatusCode);
            Assert.Equal("text/csv; charset=utf-8", http.Response.ContentType);
            Assert.Equal("nosniff", http.Response.Headers.XContentTypeOptions.ToString());
            Assert.Matches("^attachment; filename=\"audit-events-[0-9]{8}-[0-9]{6}\\.csv\"$",
                http.Response.Headers.ContentDisposition.ToString());

            var body = await new StreamReader(http.Response.Body).ReadToEndAsync();
            var lines = body.Split("\r\n", StringSplitOptions.RemoveEmptyEntries);
            Assert.Equal(
                "id,createdAt,action,actorId,actorName,targetId,targetName,matchId,ip,userAgent,details",
                lines[0]);
            Assert.Equal(3, lines.Length);
            Assert.Contains("\"'=cmd,evil\"", body, StringComparison.Ordinal);
            Assert.Contains("\"Mozilla/5.0 (\"\"quoted\"\")\"", body, StringComparison.Ordinal);
            Assert.Equal("account_disabled", lines[1].Split(',')[2]);
        }
        finally
        {
            await seeded.App.DisposeAsync();
        }
    }

    [Fact]
    public void Csv_neutralizes_formula_leads_in_user_agent_and_details()
    {
        using var details = JsonDocument.Parse("-5");
        var row = new AuditEventRow(Guid.NewGuid(), "mcp_key_issued", null, null, null, null,
            null, details.RootElement.Clone(), null, "@sum", DateTime.UtcNow);

        var csv = AuditCsv.Build([row]);

        Assert.Contains("'@sum", csv);
        Assert.Contains("'-5", csv);
    }

    public void Dispose() => db.Dispose();
}
