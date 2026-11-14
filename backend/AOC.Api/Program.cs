using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using AOC.Api;
using AOC.Api.Modules.Recording;
using AOC.Api.Http;
using AOC.Api.Modules.Admin;
using AOC.Api.Modules.Auth;
using AOC.Api.Modules.GameplayRead;
using AOC.Api.Modules.Live;
using AOC.Api.Modules.MatchCodes;
using AOC.Api.Modules.Mcp;
using AOC.Api.Modules.McpKeys;
using AOC.Api.Modules.Rtc;
using AOC.Api.Modules.Bracket;
using AOC.Api.Modules.Matches;
using AOC.Api.Modules.Questions;
using AOC.Api.Modules.Roster;
using AOC.Api.Modules.Standings;
using AOC.Api.Modules.Tournaments;
using AOC.Api.Realtime;
using AOC.Infrastructure.Auth;
using AOC.Infrastructure.Configuration;
using AOC.Infrastructure.Data;
using AOC.Infrastructure.Oidc;

var builder = WebApplication.CreateBuilder(args);
var config = AppConfig.Instance;

// Dev/ops CLI helpers (ports of backend/scripts/*.ts and db/seed.ts).
if (args.Contains("--seed-admin"))
{
    await AOC.Infrastructure.Seeding.AdminSeeder.RunAsync(config.DatabaseUrl);
    return;
}
if (args.Contains("--mint-gameplay-session"))
{
    var wanted = args.SkipWhile(a => a != "--mint-gameplay-session").Skip(1).FirstOrDefault();
    await DevTools.MintGameplaySessionAsync(wanted);
    return;
}
if (args.Contains("--mint-portal-session"))
{
    var username = args.SkipWhile(a => a != "--mint-portal-session").Skip(1).FirstOrDefault()
        ?? throw new InvalidOperationException("usage: --mint-portal-session <username>");
    await DevTools.MintPortalSessionAsync(username);
    return;
}
if (args.Contains("--mint-mcp-key"))
{
    var label = args.SkipWhile(a => a != "--mint-mcp-key").Skip(1).FirstOrDefault() ?? "claude-code";
    await DevTools.MintMcpKeyAsync(label);
    return;
}

// ---- logging: pino-pretty in dev, plain in production (mirrors TS logger) ----
builder.Logging.ClearProviders();
if (config.IsProduction)
{
    builder.Logging.AddSimpleConsole(o =>
    {
        o.SingleLine = true;
        o.TimestampFormat = "HH:mm:ss ";
    });
}
else
{
    builder.Logging.AddSimpleConsole(o =>
    {
        o.SingleLine = true;
        o.TimestampFormat = "HH:mm:ss ";
        o.UseUtcTimestamp = true;
    });
}

// ---- EF Core onto the existing Postgres schema ----
builder.Services.AddDbContextPool<AOCDbContext>(options =>
    options.Configure(config.DatabaseUrl));

// ---- cross-cutting services ----
builder.Services.AddSingleton<SessionTokens>();
builder.Services.AddSingleton<GoogleOidcService>();
builder.Services.AddScoped<AOC.Infrastructure.Audit.AuditService>();
builder.Services.AddSingleton<MatchHubRegistry>();

// ---- module services ----
builder.Services.AddScoped<AOC.Api.Modules.Auth.AuthService>();
builder.Services.AddScoped<TournamentsService>();
builder.Services.AddScoped<StandingsService>();
builder.Services.AddScoped<GroupTablesService>();
builder.Services.AddScoped<BracketService>();
builder.Services.AddScoped<MatchesService>();
builder.Services.AddScoped<AssemblePatchService>();
builder.Services.AddScoped<RecordingService>();
builder.Services.AddScoped<RosterService>();
builder.Services.AddScoped<MatchCodesService>();
builder.Services.AddScoped<SubmitService>();
builder.Services.AddScoped<LiveService>();
builder.Services.AddScoped<LiveReader>();
builder.Services.AddScoped<DraftWriter>();
builder.Services.AddScoped<QuestionsService>();
builder.Services.AddScoped<StagingService>();
builder.Services.AddScoped<GameplayReadService>();
builder.Services.AddScoped<McpKeysService>();

// ---- SignalR ----
builder.Services.AddSignalR();

// ---- MCP server (official SDK) ----
builder.Services.AddHttpContextAccessor();
builder.Services.AddMcpServer()
    .WithHttpTransport()
    .WithTools(new[]
    {
        ModelContextProtocol.Server.McpServerTool.Create(
            typeof(AOC.Api.Modules.Mcp.McpTools)
                .GetMethod(nameof(AOC.Api.Modules.Mcp.McpTools.ListQuestions))!,
            BuildMcpTools,
            new ModelContextProtocol.Server.McpServerToolCreateOptions
            {
                Name = "list_questions",
                Title = "List questions",
                Description = "List questions visible to operators: PUBLISHED and ARCHIVED. Answers are included. `usable` is true only for PUBLISHED questions.",
                ReadOnly = true,
                Idempotent = true,
                OpenWorld = false
            }),
        ModelContextProtocol.Server.McpServerTool.Create(
            typeof(AOC.Api.Modules.Mcp.McpTools)
                .GetMethod(nameof(AOC.Api.Modules.Mcp.McpTools.GetQuestion))!,
            BuildMcpTools,
            new ModelContextProtocol.Server.McpServerToolCreateOptions
            {
                Name = "get_question",
                Title = "Get question",
                Description = "Fetch one question visible to operators (PUBLISHED or ARCHIVED). Answers are included.",
                ReadOnly = true,
                Idempotent = true,
                OpenWorld = false
            }),
        ModelContextProtocol.Server.McpServerTool.Create(
            typeof(AOC.Api.Modules.Mcp.McpTools)
                .GetMethod(nameof(AOC.Api.Modules.Mcp.McpTools.EligibleQuestions))!,
            BuildMcpTools,
            new ModelContextProtocol.Server.McpServerToolCreateOptions
            {
                Name = "eligible_questions",
                Title = "Eligible questions",
                Description = "Browse the pool a match may draw from: the PUBLISHED questions (narrow with `kind`). Use this for assembly. Unlike list_questions, ARCHIVED is excluded.",
                ReadOnly = true,
                Idempotent = true,
                OpenWorld = false
            })
    });

// ---- rate limiting: per-IP fixed windows matching @fastify/rate-limit ----
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = 429;
    options.OnRejected = async (context, _) =>
    {
        context.HttpContext.Response.ContentType = "application/json; charset=utf-8";
        await context.HttpContext.Response.WriteAsync(
            """{"statusCode":429,"error":"Too Many Requests","message":"Rate limit exceeded"}""");
    };

    options.AddPolicy("strict10", http => RateLimitPartition.GetFixedWindowLimiter(
        http.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 10, Window = TimeSpan.FromMinutes(1) }));
    options.AddPolicy("viewer20", http => RateLimitPartition.GetFixedWindowLimiter(
        http.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 20, Window = TimeSpan.FromMinutes(1) }));
    options.AddPolicy("public60", http => RateLimitPartition.GetFixedWindowLimiter(
        http.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 60, Window = TimeSpan.FromMinutes(1) }));
    options.AddPolicy("public120", http => RateLimitPartition.GetFixedWindowLimiter(
        http.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 120, Window = TimeSpan.FromMinutes(1) }));
});

builder.Services.AddCors();

var app = builder.Build();

// ---- CORS: same origins, credentials on ----
var defaultAllowedOrigins = new[]
{
    "http://localhost:5173",
    "http://localhost:5175",
    "https://aoc.olympia-custom.io.vn",
    "https://portal.aoc.olympia-custom.io.vn",
    "https://gameplay.aoc.olympia-custom.io.vn",
    "https://olympia-custom.io.vn",
    "https://portal.olympia-custom.io.vn",
    "https://gameplay.olympia-custom.io.vn"
};
var corsOrigins = config.CorsOrigins.Length > 0 ? config.CorsOrigins : defaultAllowedOrigins;

app.UseCors(policy => policy
    .WithOrigins(corsOrigins)
    .AllowAnyHeader()
    .AllowAnyMethod()
    .AllowCredentials());

app.UseRateLimiter();
app.UseMiddleware<ErrorHandlingMiddleware>();

// ---- routes ----
app.MapGet("/health", () => Results.Json(new { status = "ok" }, JsonApi.Options));

app.MapAuthRoutes();
app.MapPlayerAccountRoutes();
app.MapGoogleAuthRoutes();
app.MapAdminRoutes();
app.MapTournamentRoutes();
app.MapQuestionRoutes();
app.MapMatchRoutes();
app.MapAssemblePatchRoutes();
app.MapLiveRoutes();
app.MapRosterRoutes();
app.MapMatchCodeRoutes();
app.MapStandingsRoutes();
app.MapGameplayReadRoutes();
app.MapMcpKeyRoutes();
app.MapMcpRoutes();
app.MapRtcRoutes();
app.MapRecordingRoutes();

// ---- SignalR hubs (same URLs as the old raw-WebSocket endpoints) ----
app.MapHub<PlayerLiveHub>("/gameplay/matches/{matchId}/live/stream");
app.MapHub<ConsoleLiveHub>("/portal/tournaments/{tournamentId}/matches/{matchId}/live/stream");
app.MapHub<SpectateLiveHub>("/spectate/tournaments/{tournamentId}/matches/{matchId}/live/stream");

// Migrations run on start (same behaviour as `drizzle-kit migrate` before
// `node src/server.ts`); set SKIP_MIGRATIONS=1 to opt out.
if (Environment.GetEnvironmentVariable("SKIP_MIGRATIONS") is not ("1" or "true"))
{
    await AOC.Infrastructure.Data.MigrationRunner.RunAsync(config.DatabaseUrl);
}

app.Run();

static object BuildMcpTools(ModelContextProtocol.Server.RequestContext<ModelContextProtocol.Protocol.CallToolRequestParams> context)
{
    var services = context.Services;
    return new AOC.Api.Modules.Mcp.McpTools(
        services.GetRequiredService<AOC.Api.Modules.Questions.QuestionsService>(),
        services.GetRequiredService<AOC.Api.Modules.Tournaments.TournamentsService>(),
        services.GetRequiredService<AOC.Infrastructure.Data.AOCDbContext>(),
        services.GetRequiredService<AOC.Infrastructure.Audit.AuditService>(),
        services.GetRequiredService<IHttpContextAccessor>());
}
