using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Olympia.Api.Http;
using Olympia.Api.Modules.Matches;
using Olympia.Api.Realtime;
using Olympia.Api.Shared;
using Olympia.Domain.Contracts;
using Olympia.Domain.Engine;
using Olympia.Domain.Engine.Turns;
using Olympia.Infrastructure.Data;
using Olympia.Infrastructure.Data.Entities;

namespace Olympia.Api.Modules.Live;

/// <summary>
/// Port of live/routes.ts helpers: view assembly, lobby, and the console
/// action transition (shared by the HTTP routes and the SignalR hubs).
/// </summary>
public sealed class LiveService(
    OlympiaDbContext db,
    LiveReader reader,
    MatchHubRegistry hub,
    MatchesService matches,
    ILogger<LiveService> logger)
{
    public async Task<List<ScoreRow>> ScoreTableAsync(MatchEntity match)
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

        return userIds.Select(id => new ScoreRow(
            id,
            names.GetValueOrDefault(id, id),
            sums.GetValueOrDefault(id) + adjustments.GetValueOrDefault(id))).ToList();
    }

    public sealed record ConsoleView(
        int Version,
        string RoundId,
        JsonElement State,
        List<MatchQuestion> Questions,
        Dictionary<string, object?> Projection,
        bool RoundEnded,
        List<string> Connected,
        Dictionary<string, object?>? Console);

    public async Task<ConsoleView?> ConsoleViewOfAsync(Guid matchId)
    {
        var live = await reader.ReadLiveAsync(matchId);
        if (live is null) return null;

        var match = await matches.GetMatchByIdAsync(matchId.ToString());
        var table = await ScoreTableAsync(match);
        var started = live.State.ValueKind == JsonValueKind.Object && live.State.EnumerateObject().Any();

        Dictionary<string, object?> projection;
        if (started)
        {
            var state = LiveState.ParseRoundState(live.RoundId, live.State);
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
                table));
            view.Remove("me");
            projection = view;
        }
        else
        {
            projection = new Dictionary<string, object?>
            {
                ["matchId"] = matchId.ToString(),
                ["roundId"] = live.RoundId,
                ["version"] = live.Version,
                ["stage"] = "pending",
                ["open"] = new List<object?>(),
                ["table"] = LiveView.RankTable(table),
                ["me"] = new Dictionary<string, object?>()
            };
        }

        return new ConsoleView(
            live.Version,
            live.RoundId,
            live.State,
            match.QuestionsList,
            projection,
            LiveFacts.IsRoundEnded(live.RoundId, live.State),
            hub.ConnectedUsers(matchId.ToString()),
            LiveFacts.ConsoleFacts(live.RoundId, live.State));
    }

    public async Task<ConsoleView?> AudienceViewOfAsync(Guid matchId)
    {
        var full = await ConsoleViewOfAsync(matchId);
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

        var table = await ScoreTableAsync(match);
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
            LiveView.RankTable(table),
            hub.ConnectedUsers(matchId.ToString()));
    }

    public async Task<Dictionary<string, object?>> PlayerViewOfAsync(Guid matchId, Guid userId)
    {
        var match = await matches.GetMatchByIdAsync(matchId.ToString());
        var live = await reader.ReadLiveAsync(matchId)
            ?? throw new LiveNotFoundError(matchId.ToString());

        var table = await ScoreTableAsync(match);

        if (live.State.ValueKind != JsonValueKind.Object || !live.State.EnumerateObject().Any())
        {
            return new Dictionary<string, object?>
            {
                ["matchId"] = matchId.ToString(),
                ["roundId"] = live.RoundId,
                ["version"] = live.Version,
                ["stage"] = "pending",
                ["open"] = new List<object?>(),
                ["table"] = LiveView.RankTable(table),
                ["me"] = new Dictionary<string, object?>()
            };
        }

        var state = LiveState.ParseRoundState(live.RoundId, live.State);
        return LiveView.BuildPlayerView(new LiveView.ViewInput(
            matchId.ToString(),
            live.RoundId,
            live.Version,
            DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ"),
            userId.ToString(),
            state,
            (await reader.ReadPlayerAnswersAsync(matchId, userId))
                .Select(a => new SubmittedAnswerRow(a.QuestionId, a.Judged, a.Verdict)).ToList(),
            (await reader.ReadJudgedAnswersAsync(matchId))
                .Select(a => new JudgedRow(a.QuestionId, a.UserId, a.Verdict)).ToList(),
            match.QuestionsList,
            table));
    }

    // ---- console actions -------------------------------------------------------------

    public sealed record ActionContext(
        MatchEntity Match,
        List<string> OrderedRounds,
        Guid ActorId,
        string Now);

    /// <summary>
    /// Port of the transition callback inside live routes' POST .../live/actions.
    /// Returns the new record (version bumped) and applies facts inside the store tx.
    /// </summary>
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
        return await Apply.ApplyLiveAction(store, expectedVersion, async (current, tx) =>
        {
            if (action is LiveAction.ScoreAdjust scoreAdjust)
            {
                return new Transition<JsonElement>(current.State,
                    [new AdjustFact(scoreAdjust.UserId, scoreAdjust.Delta, scoreAdjust.Reason,
                        actorId.ToString())]);
            }

            if (action is LiveAction.RoundGoTo goTo)
            {
                if (!ordered.Contains(goTo.RoundId))
                    throw new RuleError("UNKNOWN_ROUND", $"round {goTo.RoundId} is not part of this match");
                if (goTo.RoundId == current.RoundId)
                    return new Transition<JsonElement>(current.State, []);
                var archive = new Dictionary<string, JsonElement>(current.Archive)
                {
                    [current.RoundId] = current.State
                };
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

            // endRound guards: every submitted answer must be judged first.
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
                    ButPhaState engine;
                    if (action is LiveAction.ButPhaStart)
                    {
                        engine = ButPhaTurn.StartButPha([], RoundRules.ResolveButPha(
                            match.RoundConfigsMap.GetValueOrDefault(current.RoundId)));
                    }
                    else
                    {
                        engine = LiveState.ParseButPha(current.State);
                    }

                    var answerDrafts = new List<AnswerDraft>();
                    if (action is LiveAction.ButPhaFinalize finalize)
                    {
                        answerDrafts = await tx.ReadAnswerDrafts(Guid.Parse(finalize.QuestionId));
                        global::Olympia.Api.Modules.Live.Apply.AssertVerdictCoverage(
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
                        RoundRules.ResolveButPha(match.RoundConfigsMap.GetValueOrDefault(current.RoundId)),
                        match.QuestionsList.Where(q => q.RoundId == current.RoundId)
                            .OrderBy(q => q.Position).Select(q => q.Id).ToList(),
                        answerDrafts);
                    var (next, facts) = ButPhaApplier.Apply(engine, action, ctx);
                    return new Transition<JsonElement>(
                        JsonSerializer.SerializeToElement(next, JsonDefaults.Options), facts);
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
                    if (action is LiveAction.VeDichResolve && engine.Open is not null)
                        drafts = await tx.ReadAnswerDrafts(Guid.Parse(engine.Open.Question.Id));

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
                            Value = q.Points,
                            TimeLimit = q.TimeLimit
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
    }
}
