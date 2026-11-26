using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using ModelContextProtocol.Protocol;
using AOC.Api.Modules.Live;
using AOC.Api.Modules.Live.TieBreak;
using AOC.Api.Modules.Matches;
using AOC.Api.Modules.Mcp;
using AOC.Api.Modules.Questions;
using AOC.Api.Modules.Questions.Reads;
using AOC.Api.Modules.Standings;
using AOC.Api.Realtime;
using AOC.Domain.Contracts;
using AOC.Domain.Gameplay;
using AOC.Infrastructure.Audit;
using AOC.Infrastructure.Data;
using AOC.Infrastructure.Data.Entities;
using AOC.Tests.Auth;

namespace AOC.Tests.Modules;

internal sealed class McpToolHarness : IDisposable
{
    private readonly ServiceProvider services;

    public AOCDbContext Db { get; }

    private McpToolHarness(AOCDbContext db)
    {
        Db = db;
        var hub = new MatchHubRegistry(NullLogger<MatchHubRegistry>.Instance);
        var matches = new MatchesService(db, new MatchAssemblyService(db));
        var reader = new LiveReader(db);
        var tieBreak = new TieBreakService(db, new QuestionReadStore(db), reader, hub);

        var registry = new ServiceCollection();
        registry.AddSingleton(db);
        registry.AddSingleton(matches);
        registry.AddSingleton(hub);
        registry.AddSingleton(tieBreak);
        registry.AddSingleton(new QuestionReadStore(db));
        registry.AddSingleton(new QuestionsService(db));
        registry.AddSingleton(new AssemblePatchService(db));
        registry.AddSingleton(new MatchTransitionService(
            db, matches, new MatchScoringService(db), new StandingsService(db)));
        registry.AddSingleton(sp => new LiveService(
            db, reader, hub, matches,
            sp.GetRequiredService<TieBreakService>(), NullLogger<LiveService>.Instance));
        services = registry.BuildServiceProvider();
    }

    public static McpToolHarness Open() => new(AuthTestDb.OpenDb());

    public McpTools As(Guid actorId, params string[] scopes)
        => As(actorId, Guid.NewGuid(), scopes);

    public McpTools As(Guid actorId, Guid keyId, params string[] scopes)
    {
        var http = new DefaultHttpContext { RequestServices = services };
        http.Items[McpActorAccessor.ItemKey] = new McpActor(keyId, [.. scopes], actorId, null);
        return new McpTools(
            Db,
            services.GetRequiredService<QuestionReadStore>(),
            services.GetRequiredService<QuestionsService>(),
            services.GetRequiredService<AssemblePatchService>(),
            services.GetRequiredService<MatchesService>(),
            services.GetRequiredService<MatchTransitionService>(),
            services.GetRequiredService<LiveService>(),
            new AuditService(Db, NullLogger<AuditService>.Instance),
            new HttpContextAccessor { HttpContext = http });
    }

    public static JsonElement Payload(CallToolResult result)
    {
        var text = result.Content.OfType<TextContentBlock>().Single().Text;
        return JsonDocument.Parse(text).RootElement.Clone();
    }

    public static string ErrorCode(CallToolResult result)
    {
        if (result.IsError != true) throw new InvalidOperationException("expected an error result");
        return Payload(result).GetProperty("error").GetString()!;
    }

    public async Task<Guid> SeedUserAsync(UserRole role)
    {
        var id = Guid.NewGuid();
        var now = DateTime.UtcNow;
        Db.Users.Add(new UserEntity
        {
            Id = id,
            Role = role,
            Username = "mcp-" + Guid.NewGuid().ToString("N")[..10],
            DisplayName = "MCP actor",
            CreatedAt = now,
            UpdatedAt = now
        });
        await Db.SaveChangesAsync();
        return id;
    }

    public async Task<Guid> SeedTournamentAsync(Guid ownerId, Visibility visibility, params string[] rounds)
    {
        var id = Guid.NewGuid();
        var now = DateTime.UtcNow;
        Db.Tournaments.Add(new TournamentEntity
        {
            Id = id,
            Name = "MCP cup",
            Slug = Guid.NewGuid().ToString("N")[..12],
            Visibility = visibility,
            OwnerId = ownerId,
            Rounds = JsonDefaults.Serialize(rounds.Select((round, index) => new TournamentRound
            {
                Id = round,
                Name = round,
                Order = index,
                Chart = "bars"
            }).ToList()),
            Format = JsonDefaults.Serialize(new { }),
            Stages = JsonDefaults.Serialize(Array.Empty<object>()),
            CreatedAt = now,
            UpdatedAt = now
        });
        await Db.SaveChangesAsync();
        return id;
    }

    public async Task<Guid> SeedMatchAsync(Guid tournamentId, MatchStatus status = MatchStatus.UPCOMING)
    {
        var id = Guid.NewGuid();
        var now = DateTime.UtcNow;
        var butPha = AocRulebook.AocRoundConfig("but-pha")!;
        Db.Matches.Add(new MatchEntity
        {
            Id = id,
            TournamentId = tournamentId,
            StageId = "s1",
            ScheduledAt = now,
            Label = "Vòng 1",
            Status = status,
            Players = JsonDefaults.Serialize(Array.Empty<Seat>()),
            RoundConfigs = JsonDefaults.Serialize(
                new Dictionary<string, RoundConfig> { ["but-pha"] = butPha }),
            Questions = JsonDefaults.Serialize(Array.Empty<MatchQuestion>()),
            CreatedAt = now,
            UpdatedAt = now
        });
        await Db.SaveChangesAsync();
        return id;
    }

    public async Task SeedLiveAsync(Guid matchId, int version = 3)
    {
        Db.MatchLive.Add(new MatchLiveEntity
        {
            MatchId = matchId,
            Version = version,
            RoundId = "but-pha",
            State = JsonDefaults.Serialize(new { type = "BUT_PHA" }),
            Archive = JsonDefaults.EmptyObject,
            UpdatedAt = DateTime.UtcNow
        });
        await Db.SaveChangesAsync();
    }

    public async Task<Guid> SeedBucketQuestionAsync(Guid createdBy, string bucket)
    {
        var id = Guid.NewGuid();
        var now = DateTime.UtcNow;
        Db.QuestionBank.Add(new QuestionBankEntity
        {
            Id = id,
            Kind = QuestionKind.TEXT,
            QuestionText = "MCP bucket question " + Guid.NewGuid().ToString("N")[..8],
            Payload = JsonDefaults.Serialize(new { type = "TEXT", acceptedAnswers = new[] { "x" } }),
            Status = QuestionStatus.PUBLISHED,
            Tags = [bucket],
            CreatedBy = createdBy,
            CreatedAt = now,
            UpdatedAt = now
        });
        await Db.SaveChangesAsync();
        return id;
    }

    public static string ButPhaTurnId() => AocRulebook.AocRoundConfig("but-pha")!.Turns[0].Id;

    public async Task<Guid> SeedQuestionAsync(Guid createdBy, QuestionStatus status = QuestionStatus.PUBLISHED)
    {
        var id = Guid.NewGuid();
        var now = DateTime.UtcNow;
        Db.QuestionBank.Add(new QuestionBankEntity
        {
            Id = id,
            Kind = QuestionKind.CHOICE,
            QuestionText = "MCP question " + Guid.NewGuid().ToString("N")[..8],
            Payload = JsonDefaults.Serialize(new { type = "CHOICE", options = new[] { "A", "B" }, answer = "A" }),
            Status = status,
            Tags = [],
            CreatedBy = createdBy,
            CreatedAt = now,
            UpdatedAt = now
        });
        await Db.SaveChangesAsync();
        return id;
    }

    public void Dispose()
    {
        services.Dispose();
        Db.Dispose();
    }
}
