using Microsoft.EntityFrameworkCore;
using AOC.Api.Modules.Matches;
using AOC.Api.Modules.Standings;
using AOC.Domain.Contracts;
using AOC.Domain.Gameplay;
using AOC.Infrastructure.Data;
using AOC.Infrastructure.Data.Entities;
using AOC.Tests.Auth;
using Xunit;

namespace AOC.Tests.Modules;

public class MatchStartRuleCountTests
{
    private const string TurnId = "phase1";

    private sealed record Seeded(Guid TournamentId, Guid MatchId);

    private static async Task<Seeded> SeedAsync(Dictionary<string, RoundConfig> configs, int questions)
    {
        await AuthTestDb.EnsureSchemaAsync();
        var now = DateTime.UtcNow;
        var ownerId = Guid.NewGuid();
        var playerIds = new[] { Guid.NewGuid(), Guid.NewGuid() };
        var tournamentId = Guid.NewGuid();
        var matchId = Guid.NewGuid();

        using var db = AuthTestDb.OpenDb();
        db.Users.Add(new UserEntity
        {
            Id = ownerId,
            Role = UserRole.ADMIN,
            Username = "start-" + Guid.NewGuid().ToString("N")[..10],
            DisplayName = "Owner",
            CreatedAt = now,
            UpdatedAt = now
        });
        foreach (var playerId in playerIds)
            db.Users.Add(new UserEntity
            {
                Id = playerId,
                Role = UserRole.PLAYER,
                Username = "start-" + Guid.NewGuid().ToString("N")[..10],
                DisplayName = "Player",
                CreatedAt = now,
                UpdatedAt = now
            });
        await db.SaveChangesAsync();

        db.Tournaments.Add(new TournamentEntity
        {
            Id = tournamentId,
            Name = "Start cup",
            Slug = Guid.NewGuid().ToString("N")[..12],
            Visibility = Visibility.PRIVATE,
            OwnerId = ownerId,
            Rounds = JsonDefaults.Serialize(new[]
            {
                new TournamentRound { Id = "khoi-dong", Name = "Khởi động", Order = 0, Chart = "bars" }
            }),
            Format = JsonDefaults.Serialize(new TournamentFormat { CompetitorsPerMatch = 2 }),
            Stages = JsonDefaults.Serialize(new[] { new Stage { Id = "s1", Title = "Chung kết" } }),
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
            Label = "Chung kết",
            Status = MatchStatus.UPCOMING,
            Players = JsonDefaults.Serialize(playerIds.Select((id, index) => new Seat
            {
                Kind = "user",
                UserId = id.ToString(),
                Seed = index + 1
            }).ToList()),
            RoundConfigs = JsonDefaults.Serialize(configs),
            Questions = JsonDefaults.Serialize(Enumerable.Range(0, questions)
                .Select(position => Question(position))
                .ToList()),
            CreatedAt = now,
            UpdatedAt = now
        });
        await db.SaveChangesAsync();

        return new Seeded(tournamentId, matchId);
    }

    private static MatchQuestion Question(int position) => new()
    {
        Id = Guid.NewGuid().ToString(),
        RoundId = "khoi-dong",
        TurnId = TurnId,
        Position = position,
        Mode = QuestionMode.text,
        Kind = QuestionKind.TEXT,
        QuestionText = "Thủ đô của Việt Nam là?",
        Points = 10,
        Payload = new QuestionPayload.Text(["Hà Nội"]),
        SourceId = Guid.NewGuid().ToString()
    };

    private static MatchTransitionService Service(AOCDbContext db) =>
        new(db, new MatchesService(db, new MatchAssemblyService(db)), new MatchScoringService(db),
            new StandingsService(db));

    private static RoundConfig KhoiDongConfig(int? questionCount)
    {
        var config = AocRulebook.AocRoundConfig("khoi-dong")!;
        return config with
        {
            Turns = config.Turns
                .Select(turn => turn.Id == TurnId ? turn with { QuestionCount = questionCount } : turn)
                .ToList()
        };
    }

    [DbFact]
    public async Task Starting_counts_questions_with_the_rulebook_when_no_round_config_is_stored()
    {
        var seeded = await SeedAsync([], questions: 12);

        using var db = AuthTestDb.OpenDb();
        var match = await Service(db).TransitionMatchAsync(
            seeded.TournamentId.ToString(), seeded.MatchId.ToString(), "LIVE");

        Assert.Equal(MatchStatus.LIVE, match.Status);
    }

    [DbFact]
    public async Task Starting_refuses_a_round_config_that_declares_no_question_count()
    {
        var seeded = await SeedAsync(
            new Dictionary<string, RoundConfig> { ["khoi-dong"] = KhoiDongConfig(null) },
            questions: 12);

        using var db = AuthTestDb.OpenDb();
        var error = await Assert.ThrowsAsync<MatchError>(() => Service(db).TransitionMatchAsync(
            seeded.TournamentId.ToString(), seeded.MatchId.ToString(), "LIVE"));

        Assert.Equal(MatchErrorCode.NOT_READY, error.Code);
        Assert.Contains($"turn \"{TurnId}\" of round \"khoi-dong\" declares no questionCount",
            error.Message);
    }
}
