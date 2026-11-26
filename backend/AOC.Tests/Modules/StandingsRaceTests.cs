using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using AOC.Api.Http;
using AOC.Api.Modules.Matches;
using AOC.Api.Modules.Standings;
using AOC.Domain.Contracts;
using AOC.Infrastructure.Data;
using AOC.Infrastructure.Data.Entities;
using AOC.Tests.Auth;
using Xunit;

namespace AOC.Tests.Modules;

public class StandingsRaceTests
{
    private sealed record Seeded(
        Guid TournamentId,
        Guid FirstMatchId,
        Guid SecondMatchId,
        Guid SharedPlayerId);

    private static MatchQuestion Question(Guid id, string roundId) => new()
    {
        Id = id.ToString(),
        RoundId = roundId,
        TurnId = "phase1",
        Position = 0,
        Mode = QuestionMode.text,
        Kind = QuestionKind.TEXT,
        QuestionText = "Thủ đô của Việt Nam là?",
        Points = 10,
        Payload = new QuestionPayload.Text(["Hà Nội"]),
        SourceId = id.ToString()
    };

    private static async Task<Seeded> SeedAsync()
    {
        await AuthTestDb.EnsureSchemaAsync();
        var now = DateTime.UtcNow;
        var ownerId = Guid.NewGuid();
        var sharedId = Guid.NewGuid();
        var rivalId = Guid.NewGuid();
        var thirdId = Guid.NewGuid();
        var tournamentId = Guid.NewGuid();
        var firstMatchId = Guid.NewGuid();
        var secondMatchId = Guid.NewGuid();

        using var db = AuthTestDb.OpenDb();
        foreach (var (id, role, name) in new[]
        {
            (ownerId, UserRole.ADMIN, "Owner"),
            (sharedId, UserRole.PLAYER, "Shared"),
            (rivalId, UserRole.PLAYER, "Rival"),
            (thirdId, UserRole.PLAYER, "Third")
        })
            db.Users.Add(new UserEntity
            {
                Id = id,
                Role = role,
                Username = $"race-{Guid.NewGuid():N}"[..20],
                DisplayName = name,
                CreatedAt = now,
                UpdatedAt = now
            });
        await db.SaveChangesAsync();

        db.Tournaments.Add(new TournamentEntity
        {
            Id = tournamentId,
            Name = "Race cup",
            Slug = Guid.NewGuid().ToString("N")[..12],
            Visibility = Visibility.PRIVATE,
            OwnerId = ownerId,
            Rounds = JsonDefaults.Serialize(Array.Empty<TournamentRound>()),
            Format = JsonDefaults.Serialize(new TournamentFormat { CompetitorsPerMatch = 2 }),
            Stages = JsonDefaults.Serialize(new[] { new Stage { Id = "s1", Title = "Chung kết" } }),
            CreatedAt = now,
            UpdatedAt = now
        });
        await db.SaveChangesAsync();

        foreach (var userId in new[] { sharedId, rivalId, thirdId })
            db.TournamentPlayers.Add(new TournamentPlayerEntity
            {
                TournamentId = tournamentId,
                UserId = userId,
                EnrolledAt = now
            });
        await db.SaveChangesAsync();

        async Task SeedMatchAsync(
            Guid matchId, string label, Guid firstUserId, Guid secondUserId,
            int firstPoints, int secondPoints)
        {
            var roundId = "but-pha";
            var firstQuestionId = Guid.NewGuid();
            var secondQuestionId = Guid.NewGuid();
            db.Matches.Add(new MatchEntity
            {
                Id = matchId,
                TournamentId = tournamentId,
                StageId = "s1",
                ScheduledAt = now,
                Label = label,
                Status = MatchStatus.LIVE,
                Players = JsonDefaults.Serialize(new[]
                {
                    new Seat { Kind = "user", UserId = firstUserId.ToString(), Seed = 1 },
                    new Seat { Kind = "user", UserId = secondUserId.ToString(), Seed = 2 }
                }),
                RoundConfigs = JsonDefaults.Serialize(new Dictionary<string, RoundConfig>()),
                Questions = JsonDefaults.Serialize(new[]
                {
                    Question(firstQuestionId, roundId), Question(secondQuestionId, roundId)
                }),
                CreatedAt = now,
                UpdatedAt = now
            });
            await db.SaveChangesAsync();

            db.Answers.AddRange(
                new AnswerEntity
                {
                    MatchId = matchId,
                    QuestionId = firstQuestionId,
                    UserId = firstUserId,
                    Value = JsonSerializer.SerializeToElement(
                        new AnswerValue.Text("Hà Nội"), JsonApi.Options),
                    Verdict = Verdict.CORRECT,
                    PointsAwarded = firstPoints,
                    SubmittedAt = now
                },
                new AnswerEntity
                {
                    MatchId = matchId,
                    QuestionId = secondQuestionId,
                    UserId = secondUserId,
                    Value = JsonSerializer.SerializeToElement(
                        new AnswerValue.Text("Huế"), JsonApi.Options),
                    Verdict = Verdict.INCORRECT,
                    PointsAwarded = secondPoints,
                    SubmittedAt = now
                });
            await db.SaveChangesAsync();
        }

        await SeedMatchAsync(firstMatchId, "Vòng 1", sharedId, rivalId, firstPoints: 40, secondPoints: 10);
        await SeedMatchAsync(secondMatchId, "Vòng 2", sharedId, thirdId, firstPoints: 40, secondPoints: 10);

        return new Seeded(tournamentId, firstMatchId, secondMatchId, sharedId);
    }

    private static MatchTransitionService Service(AOCDbContext db) =>
        new(db, new MatchesService(db, new MatchAssemblyService(db)), new MatchScoringService(db),
            new StandingsService(db));

    [DbFact]
    public async Task Two_matches_of_one_tournament_finishing_at_once_leave_consistent_standings()
    {
        var seeded = await SeedAsync();

        using var first = AuthTestDb.OpenDb();
        using var second = AuthTestDb.OpenDb();

        await Task.WhenAll(
            Service(first).TransitionMatchAsync(
                seeded.TournamentId.ToString(), seeded.FirstMatchId.ToString(), "FINISHED"),
            Service(second).TransitionMatchAsync(
                seeded.TournamentId.ToString(), seeded.SecondMatchId.ToString(), "FINISHED"));

        using var check = AuthTestDb.OpenDb();
        var rows = await check.TournamentStandings.AsNoTracking()
            .Where(s => s.TournamentId == seeded.TournamentId)
            .ToListAsync();
        Assert.Equal(3, rows.Count);
        Assert.Equal(1, rows.Single(r => r.UserId == seeded.SharedPlayerId).Rank);
    }
}
