using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using AOC.Api.Http;
using AOC.Api.Modules.Live.TieBreak;
using AOC.Api.Modules.Matches;
using AOC.Api.Realtime;
using AOC.Api.Shared;
using AOC.Domain.Contracts;
using AOC.Domain.Gameplay;
using AOC.Domain.Gameplay.Turns;
using AOC.Infrastructure.Data;
using AOC.Infrastructure.Data.Entities;

namespace AOC.Api.Modules.Live;

public sealed partial class LiveService
{
    private readonly AOCDbContext db;
    private readonly LiveReader reader;
    private readonly MatchHubRegistry hub;
    private readonly MatchesService matches;
    private readonly TieBreakService tieBreak;
    private readonly ILogger<LiveService> logger;

    public LiveService(
        AOCDbContext db,
        LiveReader reader,
        MatchHubRegistry hub,
        MatchesService matches,
        TieBreakService tieBreak,
        ILogger<LiveService> logger)
    {
        this.db = db;
        this.reader = reader;
        this.hub = hub;
        this.matches = matches;
        this.tieBreak = tieBreak;
        this.logger = logger;
    }

    public sealed record ScoreBoard(List<ScoreRow> Rows, IReadOnlyDictionary<string, int>? TieBreak);

    public async Task<ScoreBoard> ScoreTableAsync(MatchEntity match)
    {
        var userIds = match.PlayersList
            .Where(seat => seat.Kind == "user")
            .Select(seat => seat.UserId)
            .ToList();

        var sums = await reader.SumPointsByPlayerAsync(match.Id);
        var adjustments = await reader.SumAdjustmentsByPlayerAsync(match.Id);

        var guids = userIds.Select(id => Guid.Parse(id)).ToList();
        var names = await db.Users.AsNoTracking()
            .Where(u => guids.Contains(u.Id))
            .Select(u => new { u.Id, u.DisplayName })
            .ToDictionaryAsync(u => u.Id.ToString(), u => u.DisplayName);

        var rows = userIds.Select(id => new ScoreRow(
            id,
            names.GetValueOrDefault(id, id),
            sums.GetValueOrDefault(id) + adjustments.GetValueOrDefault(id))).ToList();
        var tieBreak = (await reader.ReadLiveAsync(match.Id))?.TieBreak;
        return new ScoreBoard(rows, tieBreak?.Correct);
    }

    private async Task<List<object>> AnswerRowsOfAsync(MatchEntity match, string roundId, Dictionary<string, object?> view)
    {
        var rows = new List<object>();
        foreach (var question in match.QuestionsList.Where(q => q.RoundId == roundId).OrderBy(q => q.Position))
        {
            if (!Guid.TryParse(question.Id, out var parsed)) continue;
            rows.AddRange(await reader.ReadQuestionAnswersAsync(match.Id, parsed));
        }
        return rows;
    }

    public sealed record ConsoleView(
        int Version,
        string RoundId,
        JsonElement State,
        List<MatchQuestion> Questions,
        Dictionary<string, object?> Projection,
        bool RoundEnded,
        List<string> Connected,
        Dictionary<string, object?>? Console,
        MatchController? Controller);

    private async Task<List<RevealedAnswerRow>?> RevealedAnswersAsync(Guid matchId, object state)
    {
        var questionIdText = LiveView.RevealedIdOf(state);
        if (questionIdText is null) return null;
        if (!Guid.TryParse(questionIdText, out var questionId)) return null;
        return await reader.ReadRevealedAnswersAsync(matchId, questionId);
    }

    public async Task<ConsoleView?> ConsoleViewOfAsync(Guid matchId, bool revealAll = true)
    {
        var live = await reader.ReadLiveAsync(matchId);
        if (live is null) return null;

        var match = await matches.GetMatchByIdAsync(matchId.ToString());
        var started = live.State.ValueKind == JsonValueKind.Object && live.State.EnumerateObject().Any();
        var waiting = LiveFacts.IsWaitingState(live.State);

        Dictionary<string, object?> projection;
        if (started && waiting)
        {
            var waitingBoard = await ScoreTableAsync(match);
            projection = new Dictionary<string, object?>
            {
                ["matchId"] = matchId.ToString(),
                ["roundId"] = live.RoundId,
                ["version"] = live.Version,
                ["stage"] = "lobby",
                ["open"] = new List<object?>(),
                ["table"] = LiveView.RankTable(waitingBoard.Rows, waitingBoard.TieBreak),
                ["answers"] = new List<object>()
            };
        }
        else if (started)
        {
            var state = LiveState.ParseRoundState(live.RoundId, live.State);
            var board = await ScoreTableAsync(match);
            var view = LiveView.BuildPlayerView(new LiveView.ViewInput(
                matchId.ToString(),
                live.RoundId,
                live.Version,
                DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ"),
                "",
                state,
                [],
                null,
                match.QuestionsList,
                board.Rows,
                revealAll,
                await RevealedAnswersAsync(matchId, state),
                board.TieBreak));
            view.Remove("me");
            view["answers"] = await AnswerRowsOfAsync(match, live.RoundId, view);
            projection = view;
        }
        else
        {
            var board = await ScoreTableAsync(match);
            projection = new Dictionary<string, object?>
            {
                ["matchId"] = matchId.ToString(),
                ["roundId"] = live.RoundId,
                ["version"] = live.Version,
                ["stage"] = "pending",
                ["open"] = new List<object?>(),
                ["table"] = LiveView.RankTable(board.Rows, board.TieBreak),
                ["me"] = new Dictionary<string, object?>()
            };
        }

        var tieBreakView = await tieBreak.ViewAsync(matchId, null);
        if (tieBreakView is not null) projection["tiebreak"] = tieBreakView;

        return new ConsoleView(
            live.Version,
            live.RoundId,
            live.State,
            match.QuestionsList,
            projection,
            LiveFacts.IsRoundEnded(live.RoundId, live.State),
            hub.ConnectedUsers(matchId.ToString()),
            LiveFacts.ConsoleFacts(live.RoundId, live.State,
                DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ")),
            await ControllerOfAsync(matchId));
    }

    public async Task<MatchController?> ControllerOfAsync(Guid matchId)
    {
        var now = DateTime.UtcNow;
        var row = await db.Matches.AsNoTracking()
            .Where(m => m.Id == matchId)
            .Select(m => new { m.ControllerId, m.ControllerHeartbeatAt })
            .FirstOrDefaultAsync();
        if (row?.ControllerId is not { } holderId) return null;
        var name = await db.Users.AsNoTracking()
            .Where(u => u.Id == holderId)
            .Select(u => u.DisplayName)
            .FirstOrDefaultAsync() ?? "unknown";
        return new MatchController(holderId, name, MatchControl.IsFresh(row.ControllerHeartbeatAt, now));
    }

    public async Task<MatchController> ClaimControlAsync(Guid matchId, Guid actorId, bool takeover)
    {
        var now = DateTime.UtcNow;
        var cutoff = now - MatchControl.StaleAfter;
        var claimed = await db.Matches
            .Where(m => m.Id == matchId &&
                (takeover || m.ControllerId == null || m.ControllerId == actorId ||
                 m.ControllerHeartbeatAt == null || m.ControllerHeartbeatAt < cutoff))
            .ExecuteUpdateAsync(setters => setters
                .SetProperty(m => m.ControllerId, actorId)
                .SetProperty(m => m.ControllerHeartbeatAt, now));
        if (claimed == 0)
        {
            var holder = await ControllerOfAsync(matchId);
            throw ApiException.Conflict(
                $"match is controlled by {holder?.Name ?? "another operator"}");
        }
        return (await ControllerOfAsync(matchId))!;
    }

    public async Task RequireControllerAsync(Guid matchId, Guid actorId)
    {
        await ClaimControlAsync(matchId, actorId, takeover: false);
    }

    public async Task<bool> IsTournamentPublicAsync(Guid tournamentId)
    {
        var row = await db.Tournaments.AsNoTracking()
            .FirstOrDefaultAsync(t => t.Id == tournamentId && t.DeletedAt == null);
        if (row is null) return false;
        return row.Visibility == Visibility.PUBLIC;
    }

    public async Task<ConsoleView?> AudienceViewOfAsync(Guid matchId)
    {
        var full = await ConsoleViewOfAsync(matchId, revealAll: false);
        if (full is null) return null;
        return full with
        {
            Questions = LiveFacts.PublicQuestions(full.Questions),
            Console = null
        };
    }

    public sealed record Lobby(
        string Title,
        string Label,
        string Status,
        string? RoundId,
        List<object> Rounds,
        List<RankedScore> Table,
        List<string> Connected);

    public async Task<Lobby> LobbyOfAsync(Guid matchId)
    {
        var match = await matches.GetMatchByIdAsync(matchId.ToString());
        var tournament = await db.Tournaments.AsNoTracking()
            .FirstAsync(t => t.Id == match.TournamentId && t.DeletedAt == null);

        var board = await ScoreTableAsync(match);
        var live = await reader.ReadLiveAsync(matchId);

        var ordered = MatchRounds.OrderedMatchRounds(tournament.RoundsList, match.RoundConfigsMap);

        string StatusOf(string id, JsonElement raw)
        {
            if (raw.ValueKind != JsonValueKind.Object || !raw.EnumerateObject().Any()) return "new";
            return LiveFacts.IsRoundEnded(id, raw) ? "ended" : "playing";
        }

        var rounds = ordered.Select(id =>
        {
            JsonElement raw;
            if (live is not null && live.RoundId == id)
                raw = live.State;
            else if (live is not null && live.Archive.TryGetValue(id, out var archived))
                raw = archived;
            else
                raw = default;

            string status;
            if (live is null)
            {
                status = "new";
            }
            else if (live.RoundId == id)
            {
                status = StatusOf(id, live.State);
            }
            else
            {
                status = StatusOf(id, raw);
            }

            return (object)new Dictionary<string, object?>
            {
                ["id"] = id,
                ["name"] = tournament.RoundsList.FirstOrDefault(r => r.Id == id)?.Name ?? id,
                ["status"] = status
            };
        }).ToList();

        return new Lobby(
            tournament.Name,
            match.Label,
            match.Status.ToString(),
            live?.RoundId ?? (ordered.Count > 0 ? ordered[0] : null),
            rounds,
            LiveView.RankTable(board.Rows, board.TieBreak),
            hub.ConnectedUsers(matchId.ToString()));
    }

    public async Task<Dictionary<string, object?>> PlayerViewOfAsync(Guid matchId, Guid userId)
    {
        var match = await matches.GetMatchByIdAsync(matchId.ToString());
        var live = await reader.ReadLiveAsync(matchId)
            ?? throw new LiveNotFoundError(matchId.ToString());

        if (live.State.ValueKind != JsonValueKind.Object || !live.State.EnumerateObject().Any())
        {
            var pendingBoard = await ScoreTableAsync(match);
            return await WithTieBreakAsync(matchId, userId, new Dictionary<string, object?>
            {
                ["matchId"] = matchId.ToString(),
                ["roundId"] = live.RoundId,
                ["version"] = live.Version,
                ["stage"] = "pending",
                ["open"] = new List<object?>(),
                ["table"] = LiveView.RankTable(pendingBoard.Rows, pendingBoard.TieBreak),
                ["me"] = new Dictionary<string, object?>()
            });
        }

        if (LiveFacts.IsWaitingState(live.State))
        {
            var waitingBoard = await ScoreTableAsync(match);
            return await WithTieBreakAsync(matchId, userId, new Dictionary<string, object?>
            {
                ["matchId"] = matchId.ToString(),
                ["roundId"] = live.RoundId,
                ["version"] = live.Version,
                ["stage"] = "lobby",
                ["open"] = new List<object?>(),
                ["table"] = LiveView.RankTable(waitingBoard.Rows, waitingBoard.TieBreak),
                ["me"] = new Dictionary<string, object?>()
            });
        }

        var state = LiveState.ParseRoundState(live.RoundId, live.State);
        var board = await ScoreTableAsync(match);
        return await WithTieBreakAsync(matchId, userId, LiveView.BuildPlayerView(new LiveView.ViewInput(
            matchId.ToString(),
            live.RoundId,
            live.Version,
            DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ"),
            userId.ToString(),
            state,
            (await reader.ReadPlayerAnswersAsync(matchId, userId))
                .Select(a => new SubmittedAnswerRow(
                    a.QuestionId, a.Judged, a.Verdict, a.AnsweredMs, a.Suggestion, AnswerValueOf(a.Value))).ToList(),
            (await reader.ReadJudgedAnswersAsync(matchId))
                .Select(a => new JudgedRow(a.QuestionId, a.UserId, a.Verdict, a.AnsweredMs)).ToList(),
            match.QuestionsList,
            board.Rows,
            RevealedAnswers: await RevealedAnswersAsync(matchId, state),
            TieBreak: board.TieBreak)));
    }

    private static AnswerValue? AnswerValueOf(JsonElement raw)
    {
        if (raw.ValueKind != JsonValueKind.Object) return null;
        try
        {
            return raw.Deserialize<AnswerValue>(JsonApi.Options);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private async Task<Dictionary<string, object?>> WithTieBreakAsync(
        Guid matchId, Guid userId, Dictionary<string, object?> view)
    {
        var tieBreakView = await tieBreak.ViewAsync(matchId, userId);
        if (tieBreakView is not null) view["tiebreak"] = tieBreakView;
        return view;
    }
}
