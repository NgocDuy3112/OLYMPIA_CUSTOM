using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using AOC.Api.Http;
using AOC.Api.Modules.Live;
using AOC.Api.Realtime;
using AOC.Domain.Contracts;
using AOC.Domain.Gameplay.Turns;
using AOC.Infrastructure.Audit;
using AOC.Infrastructure.Data;
using AOC.Infrastructure.Data.Entities;
using AOC.Tests.Auth;
using Xunit;

namespace AOC.Tests.Modules;

public class BuzzDispatchTests
{
    private static string Iso(DateTime at) =>
        at.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ");

    private sealed record Fixture(Guid MatchId, Guid UserId, Guid QuestionId, SubmitService Submit);

    private static VeDichState PhaseTwoState(Guid questionId, string userId, DateTime now)
        => new()
        {
            Phase = 2,
            Players = [new VeDichPlayerState { Id = userId }],
            Open = new OpenQuestion
            {
                Question = new VeDichQuestion { Id = questionId.ToString(), Value = 20 },
                Answerer = userId,
                Window = AnswerWindow.BuzzOthers(30, Guid.NewGuid().ToString())
                    .OpenFor(Iso(now), 30),
                Revealed = true
            }
        };

    private static TieBreakState OpenTieBreak(Guid questionId, string userId, DateTime now)
        => TieBreakTurn.OpenBuzz(
            TieBreakTurn.StartTieBreak([userId, Guid.NewGuid().ToString()], [questionId.ToString()]),
            Iso(now));

    private static async Task<Fixture> SeedAsync(bool withTieBreak)
    {
        await AuthTestDb.EnsureSchemaAsync();
        var db = AuthTestDb.OpenDb();

        var now = DateTime.UtcNow;
        var userId = Guid.NewGuid();
        var questionId = Guid.NewGuid();
        var matchId = Guid.NewGuid();

        db.Users.Add(new UserEntity
        {
            Id = userId,
            Role = UserRole.PLAYER,
            Username = $"buzz-{Guid.NewGuid():N}"[..16],
            DisplayName = "An",
            CreatedAt = now,
            UpdatedAt = now
        });
        await db.SaveChangesAsync();

        var tournamentId = Guid.NewGuid();
        db.Tournaments.Add(new TournamentEntity
        {
            Id = tournamentId,
            Name = "Buzz cup",
            Slug = Guid.NewGuid().ToString("N")[..12],
            OwnerId = userId,
            Rounds = JsonDefaults.Serialize(new[]
            {
                new TournamentRound { Id = "ve-dich", Name = "ve-dich", Order = 1, Chart = "bars" }
            }),
            Format = JsonDefaults.Serialize(new { }),
            Stages = JsonDefaults.Serialize(new object[] { }),
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
            Players = JsonDefaults.Serialize(new[]
            {
                new Seat { Kind = "user", UserId = userId.ToString(), Seed = 0 }
            }),
            RoundConfigs = JsonDefaults.Serialize(new Dictionary<string, RoundConfig>()),
            Questions = JsonDefaults.Serialize(Array.Empty<MatchQuestion>()),
            CreatedAt = now,
            UpdatedAt = now
        });
        await db.SaveChangesAsync();

        var tieBreak = withTieBreak ? OpenTieBreak(questionId, userId.ToString(), now) : null;

        db.MatchLive.Add(new MatchLiveEntity
        {
            MatchId = matchId,
            Version = 1,
            RoundId = "ve-dich",
            State = JsonSerializer.SerializeToElement(
                PhaseTwoState(questionId, userId.ToString(), now), JsonApi.Options),
            Archive = JsonSerializer.SerializeToElement(new { }),
            Tiebreak = tieBreak is null
                ? null
                : JsonSerializer.SerializeToElement(tieBreak, JsonApi.Options),
            UpdatedAt = now
        });
        await db.SaveChangesAsync();

        var hub = new MatchHubRegistry(NullLogger<MatchHubRegistry>.Instance);
        var audit = new AuditService(db, NullLogger<AuditService>.Instance);
        var submit = new SubmitService(db, new LiveReader(db), new DraftWriter(db), hub, audit);
        return new Fixture(matchId, userId, questionId, submit);
    }

    [DbFact]
    public async Task A_running_tie_break_owns_the_buzz()
    {
        var fixture = await SeedAsync(withTieBreak: true);

        var result = await fixture.Submit.SubmitBuzzAsync(fixture.MatchId, fixture.UserId);

        var state = Assert.IsType<TieBreakState>(result);
        Assert.Equal(fixture.UserId.ToString(), state.Window.Buzzer);

        using var db = AuthTestDb.OpenDb();
        var live = db.MatchLive.AsNoTracking().Single(l => l.MatchId == fixture.MatchId);
        Assert.Equal(2, live.Version);
    }

    [DbFact]
    public async Task Without_a_tie_break_the_buzz_goes_to_ve_dich()
    {
        var fixture = await SeedAsync(withTieBreak: false);

        var result = await fixture.Submit.SubmitBuzzAsync(fixture.MatchId, fixture.UserId);

        Assert.IsNotType<TieBreakState>(result);

        using var db = AuthTestDb.OpenDb();
        var live = db.MatchLive.AsNoTracking().Single(l => l.MatchId == fixture.MatchId);
        var state = live.State.Deserialize<VeDichState>(JsonApi.Options)!;
        Assert.Equal(fixture.UserId.ToString(), state.Open!.Window.Buzzer);
        Assert.Null(live.Tiebreak);
    }
}
