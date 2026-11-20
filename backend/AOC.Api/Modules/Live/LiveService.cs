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

public sealed class LiveService(
    AOCDbContext db,
    LiveReader reader,
    MatchHubRegistry hub,
    MatchesService matches,
    TieBreakService tieBreak,
    ILogger<LiveService> logger)
{
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
                .Select(a => new SubmittedAnswerRow(a.QuestionId, a.Judged, a.Verdict, a.AnsweredMs, a.Suggestion)).ToList(),
            (await reader.ReadJudgedAnswersAsync(matchId))
                .Select(a => new JudgedRow(a.QuestionId, a.UserId, a.Verdict, a.AnsweredMs)).ToList(),
            match.QuestionsList,
            board.Rows,
            RevealedAnswers: await RevealedAnswersAsync(matchId, state),
            TieBreak: board.TieBreak)));
    }

    private async Task<Dictionary<string, object?>> WithTieBreakAsync(
        Guid matchId, Guid userId, Dictionary<string, object?> view)
    {
        var tieBreakView = await tieBreak.ViewAsync(matchId, userId);
        if (tieBreakView is not null) view["tiebreak"] = tieBreakView;
        return view;
    }


    public sealed record ActionContext(
        MatchEntity Match,
        List<string> OrderedRounds,
        Guid ActorId,
        string Now);

    public async Task<LiveRecord<JsonElement>> ApplyLiveActionAsync(
        Guid tournamentId, Guid matchId, int expectedVersion, LiveAction action, Guid actorId)
    {
        var match = await matches.GetMatchAsync(tournamentId.ToString(), matchId.ToString());
        if (match.Status != MatchStatus.LIVE) throw ApiException.Conflict("match is not LIVE");

        if (action is LiveAction.ScoreAdjust adjust)
        {
            if (adjust.Delta == 0) throw ApiException.BadRequest("delta must not be 0");
            var seated = match.PlayersList.Any(s =>
                s.Kind == "user" && s.UserId == adjust.UserId);
            if (!seated) throw ApiException.Forbidden("player is not seated in this match");
        }

        var tournament = await db.Tournaments.AsNoTracking()
            .FirstAsync(t => t.Id == tournamentId && t.DeletedAt == null);
        var ordered = MatchRounds.OrderedMatchRounds(tournament.RoundsList, match.RoundConfigsMap);
        var now = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ");

        var store = new PgLiveStore(db, matchId);
        var next = await Apply.ApplyLiveAction(store, expectedVersion, async (current, tx) =>
        {
            if (action is LiveAction.ScoreAdjust scoreAdjust)
            {
                return new Transition<JsonElement>(current.State,
                    [new AdjustFact(scoreAdjust.UserId, scoreAdjust.Delta, scoreAdjust.Reason,
                        actorId.ToString())]);
            }

            if (action is LiveAction.Regrade regrade)
            {
                var answer = await db.Answers.AsNoTracking().FirstOrDefaultAsync(a =>
                    a.MatchId == matchId
                    && a.QuestionId == Guid.Parse(regrade.QuestionId)
                    && a.UserId == Guid.Parse(regrade.PlayerId));
                if (answer is null)
                    throw new RuleError("NO_ANSWER",
                        $"no submitted answer from {regrade.PlayerId} to regrade");
                var newPoints = Math.Max(0, (answer.PointsAwarded ?? 0) + regrade.Delta);
                var regradeFacts = new List<LiveFact>
                {
                    new RegradeFact(regrade.QuestionId, regrade.PlayerId, newPoints)
                };

                if (current.RoundId == "khoi-dong")
                {
                    var kd = LiveState.ParseKhoiDong(current.State);
                    if (kd.Step == "phase1")
                    {
                        var runs = new Dictionary<string, Phase1State>(kd.Runs);
                        foreach (var pair in kd.Runs)
                        {
                            if (!pair.Value.Results.ContainsKey(regrade.QuestionId)) continue;
                            var results = new Dictionary<string, Phase1Result>(pair.Value.Results);
                            results[regrade.QuestionId] =
                                results[regrade.QuestionId] with { Points = newPoints };
                            runs[pair.Key] = pair.Value with { Results = results };
                        }
                        var nextKd = kd with { Runs = runs };
                        return new Transition<JsonElement>(
                            JsonSerializer.SerializeToElement(nextKd, JsonDefaults.Options), regradeFacts);
                    }
                    if (kd.Phase2 is not null
                        && kd.Phase2.Results.TryGetValue(regrade.QuestionId, out var byPlayer)
                        && byPlayer.ContainsKey(regrade.PlayerId))
                    {
                        var p2Results = new Dictionary<string, Dictionary<string, int>>(kd.Phase2.Results)
                        {
                            [regrade.QuestionId] = new Dictionary<string, int>(byPlayer)
                            {
                                [regrade.PlayerId] = newPoints
                            }
                        };
                        var nextKd = kd with { Phase2 = kd.Phase2 with { Results = p2Results } };
                        return new Transition<JsonElement>(
                            JsonSerializer.SerializeToElement(nextKd, JsonDefaults.Options), regradeFacts);
                    }
                }

                return new Transition<JsonElement>(current.State, regradeFacts);
            }

            var waiting = LiveFacts.IsWaitingState(current.State);

            if (waiting && action is LiveAction.KhoiDongEndRound
                or LiveAction.GiaiMaEndRound or LiveAction.ButPhaEndRound
                or LiveAction.VeDichEndRound)
            {
                return new Transition<JsonElement>(current.State, []);
            }

            if (action is LiveAction.RoundWaiting)
            {
                if (waiting) return new Transition<JsonElement>(current.State, []);
                if (current.State.ValueKind != JsonValueKind.Object || !current.State.EnumerateObject().Any())
                    return new Transition<JsonElement>(current.State, []);
                var pausedArchive = new Dictionary<string, JsonElement>(current.Archive)
                {
                    [current.RoundId] = current.State
                };
                return new Transition<JsonElement>(LiveFacts.WaitingMarker(), [], current.RoundId, pausedArchive);
            }

            if (action is LiveAction.RoundGoTo goTo)
            {
                if (!ordered.Contains(goTo.RoundId))
                    throw new RuleError("UNKNOWN_ROUND", $"round {goTo.RoundId} is not part of this match");
                if (goTo.RoundId == current.RoundId)
                {
                    if (waiting && current.Archive.TryGetValue(goTo.RoundId, out var resumed))
                        return new Transition<JsonElement>(resumed, []);
                    return new Transition<JsonElement>(current.State, []);
                }
                var archive = new Dictionary<string, JsonElement>(current.Archive);
                if (!waiting) archive[current.RoundId] = current.State;
                var target = current.Archive.TryGetValue(goTo.RoundId, out var restored)
                    ? restored
                    : JsonDefaults.EmptyObject;
                return new Transition<JsonElement>(target, [], goTo.RoundId, archive);
            }

            if (action is LiveAction.RevealAnswer reveal)
            {
                if (current.State.ValueKind != JsonValueKind.Object || !current.State.EnumerateObject().Any())
                    throw new RuleError("NOT_STARTED", "start the round before revealing an answer");
                var question = match.QuestionsList.FirstOrDefault(q =>
                    q.Id == reveal.QuestionId && q.RoundId == current.RoundId);
                if (question is null)
                    throw new RuleError("INVALID_QUESTION",
                        $"question {reveal.QuestionId} is not a question of round {current.RoundId}");

                var dict = current.State.Deserialize<Dictionary<string, JsonElement>>(JsonApi.Options)!;
                dict["revealedAnswer"] = JsonSerializer.SerializeToElement(question.Id);
                return new Transition<JsonElement>(
                    JsonSerializer.SerializeToElement(dict, JsonApi.Options), []);
            }

            if (!action.Kind.StartsWith($"{current.RoundId}."))
                throw new RuleError("WRONG_ROUND",
                    $"action {action.Kind} does not belong to round {current.RoundId}");

            if (action is LiveAction.GiaiMaEndRound or LiveAction.ButPhaEndRound or LiveAction.KhoiDongEndRound)
            {
                foreach (var question in match.QuestionsList.Where(q => q.RoundId == current.RoundId))
                {
                    var drafts = await tx.ReadAnswerDrafts(Guid.Parse(question.Id));
                    if (drafts.Any(d => !d.Judged))
                        throw new RuleError("UNJUDGED_ANSWERS",
                            "judge every submitted answer before ending the round");
                }
            }

            switch (current.RoundId)
            {
                case "giai-ma":
                {
                    var answerDrafts = new List<AnswerDraft>();
                    if (action is LiveAction.GiaiMaResolveHint && LiveState.ParseGiaiMa(current.State).OpenHint is { } openHint)
                    {
                        answerDrafts = await tx.ReadAnswerDrafts(Guid.Parse(openHint));
                    }
                    else if (action is LiveAction.GiaiMaResolveHint)
                    {
                        throw new RuleError("NO_OPEN_HINT", "no hint window is open");
                    }

                    var hintTurnId = "";
                    if (action is LiveAction.GiaiMaOpenHint open)
                    {
                        var hint = match.QuestionsList.FirstOrDefault(q => q.Id == open.HintId);
                        if (hint is null) throw ApiException.BadRequest("hint is not a question of this match");
                        if (hint.RoundId != current.RoundId)
                            throw ApiException.BadRequest("hint is not part of the current round");
                        hintTurnId = hint.TurnId;
                    }
                    if (action is LiveAction.GiaiMaSubmitKeyword || action is LiveAction.GiaiMaJudgeKeyword)
                    {
                        string qid;
                        if (action is LiveAction.GiaiMaSubmitKeyword submitKeyword)
                        {
                            qid = submitKeyword.QuestionId;
                        }
                        else
                        {
                            qid = ((LiveAction.GiaiMaJudgeKeyword)action).QuestionId;
                        }
                        var q = match.QuestionsList.FirstOrDefault(c => c.Id == qid);
                        if (q is null) throw ApiException.BadRequest("question is not part of this match");
                        if (q.Kind != QuestionKind.KEYWORD)
                            throw ApiException.BadRequest("the keyword question must be of kind KEYWORD");
                    }

                    GiaiMaState engine;
                    if (action is LiveAction.GiaiMaStart)
                    {
                        engine = GiaiMaTurn.StartGiaiMa([], [], RoundRules.ResolveGiaiMa(
                            match.RoundConfigsMap.GetValueOrDefault(current.RoundId)));
                    }
                    else
                    {
                        engine = LiveState.ParseGiaiMa(current.State);
                    }

                    var ctx = new GiaiMaContext(actorId.ToString(), current.RoundId, now,
                        RoundRules.ResolveGiaiMa(match.RoundConfigsMap.GetValueOrDefault(current.RoundId)),
                        hintTurnId, answerDrafts);
                    var (next, facts) = GiaiMaApplier.Apply(engine, action, ctx);
                    return new Transition<JsonElement>(
                        JsonSerializer.SerializeToElement(next, JsonDefaults.Options), facts);
                }

                case "but-pha":
                {
                    var butPhaRules = RoundRules.ResolveButPha(
                        match.RoundConfigsMap.GetValueOrDefault(current.RoundId));
                    var engine = ButPhaEngineSeed(action, butPhaRules, current.State);

                    var answerDrafts = new List<AnswerDraft>();
                    if (action is LiveAction.ButPhaFinalize finalize)
                    {
                        answerDrafts = await tx.ReadAnswerDrafts(Guid.Parse(finalize.QuestionId));
                        global::AOC.Api.Modules.Live.Apply.AssertVerdictCoverage(
                            answerDrafts, finalize.Verdicts, "finalizing");
                    }
                    if (action is LiveAction.ButPhaCloseQuestion)
                    {
                        var open = ButPhaTurn.OpenQuestionId(engine);
                        if (open is not null)
                        {
                            var drafts = await tx.ReadAnswerDrafts(Guid.Parse(open));
                            if (drafts.Any(d => !d.Judged))
                                throw new RuleError("UNJUDGED_ANSWERS",
                                    "judge every submitted answer before closing the question");
                        }
                    }

                    var ctx = new ButPhaApplier.ButPhaContext(actorId.ToString(), current.RoundId, now,
                        butPhaRules,
                        match.QuestionsList.Where(q => q.RoundId == current.RoundId)
                            .OrderBy(q => q.Position).Select(q => q.Id).ToList(),
                        answerDrafts);
                    Transition<JsonElement> transition;
                    try
                    {
                        var (next, facts) = ButPhaApplier.Apply(engine, action, ctx);
                        transition = new Transition<JsonElement>(
                            JsonSerializer.SerializeToElement(next, JsonDefaults.Options), facts);
                    }
                    catch (RuleError error) when (error.Code == "VALIDATION" && action is LiveAction.ButPhaStart)
                    {
                        var perRound = string.Join(", ", match.QuestionsList
                            .GroupBy(q => q.RoundId)
                            .Select(group => $"{group.Key}: {group.Count()}"));
                        throw new RuleError(error.Code,
                            $"{error.Message} — questions stored on this match by round: [{perRound}]");
                    }
                    return transition;
                }

                case "khoi-dong":
                {
                    var config = match.RoundConfigsMap.GetValueOrDefault(current.RoundId)
                        ?? AocRulebook.AocRoundConfig(current.RoundId);
                    var turns = config?.Turns ?? [];
                    var questions = match.QuestionsList
                        .Where(q => q.RoundId == current.RoundId)
                        .OrderBy(q => q.Position)
                        .ToList();
                    List<string> IdsFor(string? turnId) => turnId is null
                        ? []
                        : questions.Where(q => q.TurnId == turnId).Select(q => q.Id).ToList();

                    KhoiDongState engine;
                    if (action is LiveAction.KhoiDongStart)
                    {
                        engine = new KhoiDongState { Rules = RoundRules.ResolveKhoiDong(config) };
                    }
                    else
                    {
                        engine = LiveState.ParseKhoiDong(current.State);
                    }

                    var answerDrafts = new List<AnswerDraft>();
                    if (action is LiveAction.KhoiDongJudge or LiveAction.KhoiDongNextQuestion)
                    {
                        var questionId = engine.Phase2 is null
                            ? null
                            : KhoiDongTurn.Phase2QuestionId(engine.Phase2);
                        if (questionId is not null)
                            answerDrafts = await tx.ReadAnswerDrafts(Guid.Parse(questionId));
                    }

                    var ctx = new KhoiDongApplier.KhoiDongContext(
                        actorId.ToString(), current.RoundId, now,
                        RoundRules.ResolveKhoiDong(config),
                        match.PlayersList.Where(s => s.Kind == "user")
                            .OrderBy(s => s.Seed).Select(s => s.UserId).ToList(),
                        IdsFor(turns.Count > 0 ? turns[0].Id : null),
                        IdsFor(turns.Count > 1 ? turns[1].Id : null),
                        answerDrafts);

                    var (next, facts) = KhoiDongApplier.Apply(engine, action, ctx);
                    return new Transition<JsonElement>(
                        JsonSerializer.SerializeToElement(next, JsonDefaults.Options), facts);
                }

                case "ve-dich":
                {
                    VeDichState engine;
                    if (action is LiveAction.VeDichStart)
                    {
                        engine = new VeDichState
                        {
                            Rules = RoundRules.ResolveVeDich(
                                match.RoundConfigsMap.GetValueOrDefault(current.RoundId))
                        };
                    }
                    else
                    {
                        engine = LiveState.ParseVeDich(current.State);
                    }

                    var drafts = new List<AnswerDraft>();
                    var needsDrafts = action is LiveAction.VeDichResolve or LiveAction.VeDichJudge;
                    if (engine.Open is not null)
                    {
                        if (needsDrafts)
                            drafts = await tx.ReadAnswerDrafts(Guid.Parse(engine.Open.Question.Id));
                    }

                    Dictionary<string, int> sums;
                    if (action is LiveAction.VeDichStart)
                    {
                        sums = await reader.SumPointsByPlayerAsync(matchId);
                    }
                    else
                    {
                        sums = new Dictionary<string, int>();
                    }

                    var questions = match.QuestionsList
                        .Where(q => q.RoundId == "ve-dich")
                        .OrderBy(q => q.Position)
                        .Select(q => new VeDichQuestion
                        {
                            Id = q.Id,
                            Value = q.Points
                        })
                        .ToList();

                    var players = match.PlayersList
                        .Where(s => s.Kind == "user")
                        .Select(s => (Id: s.UserId, Score: sums.GetValueOrDefault(s.UserId)))
                        .ToList();

                    var ctx = new VeDichApplier.VeDichContext(
                        actorId.ToString(), current.RoundId, now,
                        RoundRules.ResolveVeDich(match.RoundConfigsMap.GetValueOrDefault(current.RoundId)),
                        questions, players, drafts);

                    var (next, facts) = VeDichApplier.Apply(engine, action, ctx);
                    return new Transition<JsonElement>(
                        JsonSerializer.SerializeToElement(next, JsonDefaults.Options), facts);
                }

                default:
                    throw new RuleError("WRONG_ROUND",
                        $"round {current.RoundId} has no controller actions yet");
            }
        });

        await BroadcastSfxAsync(matchId, action, next);
        return next;
    }

    public static ButPhaState ButPhaEngineSeed(
        LiveAction action, RoundRules.ButPhaRules rules, JsonElement savedState)
    {
        if (action is LiveAction.ButPhaStart)
        {
            return new ButPhaState { Rules = rules };
        }
        return LiveState.ParseButPha(savedState);
    }

    private async Task BroadcastSfxAsync(Guid matchId, LiveAction action, LiveRecord<JsonElement> next)
    {
        try
        {
            var file = Sfx.FileFor(action, next.State, next.RoundId);
            if (file is null) return;
            await Sfx.BroadcastAsync(hub, matchId.ToString(), file);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "sfx cue for match {MatchId} failed", matchId);
        }
    }
}
