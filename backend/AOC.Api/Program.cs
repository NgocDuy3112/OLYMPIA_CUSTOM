using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using AOC.Api.Http;
using AOC.Api.Modules.Admin;
using AOC.Api.Modules.Auth;
using AOC.Api.Modules.GameplayRead;
using AOC.Api.Modules.Live;
using AOC.Api.Modules.Live.TieBreak;
using AOC.Api.Modules.MatchCodes;
using AOC.Api.Modules.Mcp;
using AOC.Api.Modules.McpKeys;
using AOC.Api.Modules.Rtc;
using AOC.Api.Modules.Matches;
using AOC.Api.Modules.Questions;
using AOC.Api.Modules.Roster;
using AOC.Api.Modules.Standings;
using AOC.Api.Modules.Tournaments;
using AOC.Api.Realtime;
using AOC.Infrastructure.Auth;
using AOC.Infrastructure.Configuration;
using AOC.Infrastructure.Data;
using AOC.Infrastructure.Email;
using AOC.Infrastructure.Oidc;

var builder = WebApplication.CreateBuilder(args);
var config = AppConfig.Instance;

if (args.Contains("--seed-admin"))
{
    await AOC.Infrastructure.Seeding.AdminSeeder.RunAsync(config.DatabaseUrl);
    return;
}

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

if (config.DiscordLog.Configured)
    builder.Logging.AddProvider(new AOC.Api.Logging.DiscordLoggerProvider(config.DiscordLog));

builder.Services.AddDbContextPool<AOCDbContext>(options =>
    options.Configure(config.DatabaseUrl));

builder.Services.AddSingleton<SessionTokens>();
builder.Services.AddSingleton<SmtpEmailService>();
builder.Services.AddSingleton<EmailQueue>();
builder.Services.AddSingleton<IEmailService, QueuedEmailService>();
builder.Services.AddHostedService<AOC.Api.Email.EmailDispatchService>();
builder.Services.AddSingleton<GoogleOidcService>();
builder.Services.AddScoped<AOC.Infrastructure.Audit.AuditService>();
builder.Services.AddSingleton<MatchHubRegistry>();
builder.Services.AddSingleton<AOC.Api.Modules.MatchCodes.ClaimAttemptLimiter>();

builder.Services.AddScoped<AOC.Api.Modules.Auth.AuthService>();
builder.Services.AddScoped<AOC.Api.Modules.Auth.GoogleAuthService>();
builder.Services.AddScoped<AOC.Api.Modules.Admin.AdminService>();
builder.Services.AddScoped<TournamentsService>();
builder.Services.AddScoped<StandingsService>();
builder.Services.AddScoped<GroupTablesService>();
builder.Services.AddScoped<MatchesService>();
builder.Services.AddScoped<MatchAssemblyService>();
builder.Services.AddScoped<MatchScoringService>();
builder.Services.AddScoped<MatchTransitionService>();
builder.Services.AddScoped<AssemblePatchService>();
builder.Services.AddScoped<RosterService>();
builder.Services.AddScoped<AOC.Api.Modules.Admin.AccountStatusService>();
builder.Services.AddScoped<MatchCodesService>();
builder.Services.AddScoped<SubmitService>();
builder.Services.AddScoped<LiveService>();
builder.Services.AddScoped<LiveReader>();
builder.Services.AddScoped<TieBreakService>();
builder.Services.AddScoped<DraftWriter>();
builder.Services.AddScoped<DraftAuditStore>();
builder.Services.AddScoped<QuestionsService>();
builder.Services.AddScoped<AOC.Api.Modules.Questions.Reads.QuestionReadStore>();
builder.Services.AddScoped<AOC.Api.Modules.Questions.Reads.QuestionUsageStore>();
builder.Services.AddScoped<AOC.Api.Modules.Questions.Reads.IQuestionReads>(
    sp => sp.GetRequiredService<AOC.Api.Modules.Questions.Reads.QuestionReadStore>());
builder.Services.AddScoped<MatchDirectImportService>();
builder.Services.AddScoped<GameplayReadService>();
builder.Services.AddScoped<McpKeysService>();

builder.Services.AddSignalR(options =>
    options.MaximumReceiveMessageSize = AOC.Api.Modules.Live.Protocol.MaxClientMessageBytes);

builder.Services.AddHttpContextAccessor();
builder.Services.AddMcpServer()
    .WithHttpTransport()
    .WithTools(AOC.Api.Modules.Mcp.McpToolCatalog.BuildTools(BuildMcpTools));

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
    options.AddPolicy("public60", http => RateLimitPartition.GetFixedWindowLimiter(
        http.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 60, Window = TimeSpan.FromMinutes(1) }));
    options.AddPolicy("public120", http => RateLimitPartition.GetFixedWindowLimiter(
        http.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 120, Window = TimeSpan.FromMinutes(1) }));
    options.AddPolicy("live30", http => RateLimitPartition.GetFixedWindowLimiter(
        http.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 30, Window = TimeSpan.FromMinutes(1) }));
});

builder.Services.AddCors();

var app = builder.Build();

app.Logger.LogInformation("smtp email delivery: {State}",
    app.Services.GetRequiredService<SmtpEmailService>().IsConfigured ? "configured" : "not configured");

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

app.UseMiddleware<RequestLoggingMiddleware>();
app.UseRateLimiter();
app.UseMiddleware<ErrorHandlingMiddleware>();

app.MapGet("/health", () => Results.Json(new { status = "ok" }, JsonApi.Options));

app.MapAuthRoutes();
app.MapPlayerAccountRoutes();
app.MapGoogleAuthRoutes();
app.MapAdminRoutes();
app.MapTournamentRoutes();
app.MapQuestionRoutes();
app.MapQuestionStagingRoutes();
app.MapMatchRoutes();
app.MapMatchAssemblyRoutes();
app.MapMatchScoringRoutes();
app.MapAssemblePatchRoutes();
app.MapLiveRoutes();
app.MapTieBreakRoutes();
app.MapRosterRoutes();
app.MapMatchCodeRoutes();
app.MapStandingsRoutes();
app.MapGameplayReadRoutes();
app.MapMcpKeyRoutes();
app.MapMcpRoutes();
app.MapRtcRoutes();

app.MapHub<PlayerLiveHub>("/api/matches/{matchId}/live/stream");
app.MapHub<ConsoleLiveHub>("/portal/tournaments/{tournamentId}/matches/{matchId}/live/stream");
app.MapHub<SpectateLiveHub>("/spectate/tournaments/{tournamentId}/matches/{matchId}/live/stream");

if (Environment.GetEnvironmentVariable("SKIP_MIGRATIONS") is not ("1" or "true"))
{
    await AOC.Infrastructure.Data.MigrationRunner.RunAsync(config.DatabaseUrl);
}

app.Run();

static object BuildMcpTools(ModelContextProtocol.Server.RequestContext<ModelContextProtocol.Protocol.CallToolRequestParams> context)
{
    var services = context.Services;
    return new AOC.Api.Modules.Mcp.McpTools(
        services.GetRequiredService<AOC.Infrastructure.Data.AOCDbContext>(),
        services.GetRequiredService<AOC.Api.Modules.Questions.Reads.QuestionReadStore>(),
        services.GetRequiredService<AOC.Api.Modules.Questions.QuestionsService>(),
        services.GetRequiredService<AOC.Api.Modules.Matches.AssemblePatchService>(),
        services.GetRequiredService<AOC.Api.Modules.Matches.MatchesService>(),
        services.GetRequiredService<AOC.Api.Modules.Matches.MatchTransitionService>(),
        services.GetRequiredService<AOC.Api.Modules.Live.LiveService>(),
        services.GetRequiredService<AOC.Infrastructure.Audit.AuditService>(),
        services.GetRequiredService<IHttpContextAccessor>());
}
