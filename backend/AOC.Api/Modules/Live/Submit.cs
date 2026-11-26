using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using AOC.Api.Http;
using AOC.Api.Modules.Live.TieBreak;
using AOC.Api.Modules.Matches;
using AOC.Api.Realtime;
using AOC.Domain.Contracts;
using AOC.Domain.Gameplay;
using AOC.Domain.Gameplay.Turns;
using AOC.Infrastructure.Data;
using AOC.Infrastructure.Data.Entities;

namespace AOC.Api.Modules.Live;

public sealed class SubmitService(
    AOCDbContext db,
    LiveReader reader,
    DraftWriter drafts,
    MatchHubRegistry hub,
    DraftAuditStore audit)
{
    public sealed record SubmitContext(
        Guid MatchId,
        Guid UserId,
        Guid QuestionId,
        JsonElement Value,
        string? Ip = null,
        string? UserAgent = null,
        DateTimeOffset? PressedAt = null);

    private const int ClampLagMs = 2_000;

    public static string ClampPressed(DateTimeOffset? pressed, string serverNowIso)
    {
        var serverNow = DateTimeOffset.Parse(serverNowIso);
        if (pressed is not { } value) return serverNowIso;
        var earliest = serverNow.AddMilliseconds(-ClampLagMs);
        DateTimeOffset clamped = value;
        if (value < earliest) clamped = earliest;
        if (value > serverNow) clamped = serverNow;
        return clamped.UtcDateTime.ToString("yyyy-MM-ddTHH:mm:ss.fffZ");
    }

    private static string ClampedPressIso(SubmitContext ctx, string serverNowIso)
        => ClampPressed(ctx.PressedAt, serverNowIso);

    public static DateTimeOffset? ReadPressedAt(JsonElement body)
    {
        if (!body.TryGetProperty("pressedAt", out var el)) return null;
        if (el.ValueKind != JsonValueKind.String) return null;
        if (!DateTimeOffset.TryParse(el.GetString(), out var parsed)) return null;
        return parsed;
    }

    private static int PressedMs(AnswerWindow window, SubmitContext ctx, string serverNowIso)
    {
        var pressedIso = ClampedPressIso(ctx, serverNowIso);
        return window.ElapsedMs(pressedIso);
    }

    public sealed record AnswerResult(bool Drafted = true);

    private sealed record Loaded(MatchEntity Match, LiveReader.LiveSnapshot Live, string Now);

    private async Task<Loaded> LoadContextAsync(SubmitContext ctx)
    {
        var match = await db.Matches.AsNoTracking().FirstOrDefaultAsync(m => m.Id == ctx.MatchId)
            ?? throw new SubmitError(404, "NOT_FOUND", "match not found");
        if (match.Status != MatchStatus.LIVE)
            throw new SubmitError(409, "NOT_LIVE", "match is not LIVE");
        if (!MatchSeats.IsSeatedInMatch(match.PlayersList, ctx.UserId))
            throw new SubmitError(403, "NOT_SEATED", "you are not a player in this match");

        var live = await reader.ReadLiveAsync(ctx.MatchId)
            ?? throw new SubmitError(404, "NO_ROUND", "no live round");
        if (live.State.ValueKind != JsonValueKind.Object || !live.State.EnumerateObject().Any())
            throw new SubmitError(409, "NOT_STARTED", $"round {live.RoundId} has not started");

        return new Loaded(match, live, DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ"));
    }

    private static SubmittedAnswerValue TextOfChoice(Loaded loaded, SubmitContext ctx, SubmittedAnswerValue value, string message)
    {
        if (value is not SubmittedAnswerValue.Picked picked) return value;
        var question = loaded.Match.QuestionsList.FirstOrDefault(q => q.Id == ctx.QuestionId.ToString())
            ?? throw new SubmitError(400, "NOT_IN_MATCH", "question is not part of this match");
        var optionId = picked.Items.FirstOrDefault();
        var choice = question.Payload as QuestionPayload.Choice
            ?? throw new SubmitError(400, "BAD_VALUE", message);
        var option = choice.Options.FirstOrDefault(o => o.Id == optionId)
            ?? throw new SubmitError(400, "BAD_VALUE", "unknown option");
        return new SubmittedAnswerValue.Text(option.Text);
    }

    private static Verdict Suggestion(MatchQuestion question, SubmittedAnswerValue value)
        => Matching.AutoMatch(question.Kind, question.Payload, value)
            ? Verdict.CORRECT
            : Verdict.INCORRECT;

    private static void AssertWindow(AnswerWindow window, string playerId, string nowIso,
        string notStartedCode, string notStartedMessage, string closedMessage)
    {
        try
        {
            window.AssertCanAnswer(playerId, nowIso);
        }
        catch (RuleError error)
        {
            if (error.Code == "WINDOW_NOT_OPEN")
                throw new SubmitError(409, notStartedCode, notStartedMessage);
            throw new SubmitError(409, "WINDOW_CLOSED", closedMessage);
        }
    }

    private async Task<AnswerResult> DraftAsync(
        Loaded loaded, SubmitContext ctx, SubmittedAnswerValue value, int answeredMs)
    {
        var question = loaded.Match.QuestionsList.FirstOrDefault(q => q.Id == ctx.QuestionId.ToString())
            ?? throw new SubmitError(400, "NOT_IN_MATCH", "question is not part of this match");
        var suggestion = Suggestion(question, value);
        var changed = await drafts.WriteDraftAsync(ctx.MatchId, ctx.QuestionId, ctx.UserId,
            ctx.Value, suggestion, answeredMs: answeredMs);
        if (!changed) return new AnswerResult();

        await DraftAuditAsync(ctx, loaded.Live.RoundId, suggestion);

        await hub.PublishAsync(ctx.MatchId.ToString());
        return new AnswerResult();
    }

    private async Task DraftAuditAsync(SubmitContext ctx, string roundId, Verdict suggestion)
    {
        await audit.RecordReviseAsync(ctx.MatchId, roundId, ctx.QuestionId, ctx.UserId, suggestion,
            ctx.Ip, ctx.UserAgent);
    }

    private static Transition<JsonElement> ToTransition<TState>(TState nextState, List<LiveFact> facts)
    {
        var element = JsonSerializer.SerializeToElement(nextState, JsonDefaults.Options);
        return new Transition<JsonElement>(element, facts);
    }

    private async Task BroadcastAsync(Guid matchId, string? file)
    {
        var id = matchId.ToString();
        await Sfx.BroadcastAsync(hub, id, file);
        await hub.PublishAsync(id);
    }

    public async Task<AnswerResult> SubmitAnswerAsync(SubmitContext ctx)
    {
        var value = ParseValue(ctx.Value);
        var loaded = await LoadContextAsync(ctx);

        switch (loaded.Live.RoundId)
        {
            case "giai-ma":
                return await SubmitGiaiMaAsync(loaded, ctx, value);
            case "but-pha":
                return await SubmitButPhaAsync(loaded, ctx, value);
            case "khoi-dong":
                return await SubmitKhoiDongAsync(loaded, ctx, value);
            case "ve-dich":
                return await SubmitVeDichAsync(loaded, ctx, value);
            default:
                throw new SubmitError(409, "NO_ROUND", $"round {loaded.Live.RoundId} does not accept answers yet");
        }
    }

    private async Task<AnswerResult> SubmitGiaiMaAsync(Loaded loaded, SubmitContext ctx, SubmittedAnswerValue value)
    {
        var state = LiveState.ParseGiaiMa(loaded.Live.State);
        if (state.OpenHint != ctx.QuestionId.ToString())
            throw new SubmitError(409, "NO_WINDOW", "no answer window is open for this question");
        AssertWindow(state.HintWindow, ctx.UserId.ToString(), loaded.Now,
            "WINDOW_CLOSED", "the answer window has closed",
            "the answer window has closed");
        if (GiaiMaTurn.KeywordWindowRunning(state, loaded.Now))
            throw new SubmitError(409, "WINDOW_CLOSED", "the answer window has closed");
        if (!GiaiMaTurn.CanPlayerAnswer(state, ctx.UserId.ToString(), loaded.Now))
            throw new SubmitError(409, "LOCKED", "you can no longer answer this round");

        return await DraftAsync(loaded, ctx, value, PressedMs(state.HintWindow, ctx, loaded.Now));
    }

    private async Task<AnswerResult> SubmitButPhaAsync(Loaded loaded, SubmitContext ctx, SubmittedAnswerValue value)
    {
        if (value is not SubmittedAnswerValue.Text)
            throw new SubmitError(400, "BAD_VALUE", "a but-pha answer must be text");
        var state = LiveState.ParseButPha(loaded.Live.State);
        var openId = ButPhaTurn.OpenQuestionId(state);
        if (openId is null) throw new SubmitError(409, "NO_QUESTION", "no question is open");
        if (openId != ctx.QuestionId.ToString())
            throw new SubmitError(409, "NOT_OPEN", "that question is not open");
        AssertWindow(state.Window, ctx.UserId.ToString(), loaded.Now,
            "NO_CLOCK", "the question's clock has not started",
            "the answer window has closed");

        return await DraftAsync(loaded, ctx, value, PressedMs(state.Window, ctx, loaded.Now));
    }

    private async Task<AnswerResult> SubmitKhoiDongAsync(Loaded loaded, SubmitContext ctx, SubmittedAnswerValue value)
    {
        value = TextOfChoice(loaded, ctx, value, "a chung answer must be text");
        var state = LiveState.ParseKhoiDong(loaded.Live.State);
        if (state.Flow != Flow.chung || state.Phase2 is null)
            throw new SubmitError(409, "NO_WINDOW",
                "khởi động riêng is oral — there is nothing to type yet");
        var questionId = KhoiDongTurn.Phase2QuestionId(state.Phase2);
        if (questionId is null)
            throw new SubmitError(409, "ENDED", "every chung question has been played");
        if (questionId != ctx.QuestionId.ToString())
            throw new SubmitError(409, "NOT_OPEN", "that question is not the one in play");
        AssertWindow(state.Phase2.Window, ctx.UserId.ToString(), loaded.Now,
            "NO_WINDOW", "the console has not started the clock for this question yet",
            "the clock has run out — the answer window is closed");
        if (state.Phase2.Closed)
            throw new SubmitError(409, "WINDOW_CLOSED",
                "the clock has run out — the answer window is closed");

        return await DraftAsync(loaded, ctx, value, PressedMs(state.Phase2.Window, ctx, loaded.Now));
    }

    private async Task<AnswerResult> SubmitVeDichAsync(Loaded loaded, SubmitContext ctx, SubmittedAnswerValue value)
    {
        if (value is not SubmittedAnswerValue.Text)
            throw new SubmitError(400, "BAD_VALUE", "a ve-dich phase-1 answer must be text");
        var state = LiveState.ParseVeDich(loaded.Live.State);
        if (state.Ended) throw new SubmitError(409, "ENDED", "the round has ended");
        if (state.Phase != 1) throw new SubmitError(409, "PHASE_CLOSED", "phase 1 is over");

        var open = state.Open;
        if (open is null || open.Question.Id != ctx.QuestionId.ToString())
            throw new SubmitError(409, "NOT_OPEN", "that question is not open");
        AssertWindow(open.Window, ctx.UserId.ToString(), loaded.Now,
            "NO_CLOCK", "the clock has not started yet",
            "the answer window for this question has closed");

        return await DraftAsync(loaded, ctx, value, PressedMs(open.Window, ctx, loaded.Now));
    }

    public async Task<AnswerResult> SubmitKeywordAsync(SubmitContext ctx)
    {
        var value = ParseValue(ctx.Value);
        if (value is not SubmittedAnswerValue.Text textValue)
            throw new SubmitError(400, "BAD_VALUE", "a keyword answer must be text");

        var loaded = await LoadContextAsync(ctx);
        if (loaded.Live.RoundId != "giai-ma")
            throw new SubmitError(409, "NO_KEYWORD", $"round {loaded.Live.RoundId} has no keyword submission");

        var keywordQuestion = loaded.Match.QuestionsList.FirstOrDefault(q =>
            q.Kind == QuestionKind.KEYWORD && q.RoundId == loaded.Live.RoundId);
        if (keywordQuestion is null)
            throw new SubmitError(400, "NO_KEYWORD", "this round has no keyword question");
        if (keywordQuestion.Id != ctx.QuestionId.ToString())
            throw new SubmitError(400, "NOT_KEYWORD", "question is not this round's keyword");

        var suggestion = Matching.AutoMatch(QuestionKind.KEYWORD,
            keywordQuestion.Payload, value) ? Verdict.CORRECT : Verdict.INCORRECT;

        var store = new PgLiveStore(db, ctx.MatchId);
        await Apply.MutateLive(store, async tx =>
        {
            var current = await tx.Load();
            var state = LiveState.ParseGiaiMa(current.State);
            if (state.Players.FirstOrDefault(p => p.Id == ctx.UserId.ToString())?.KeywordLocked == true)
                throw new RuleError("ALREADY_SUBMITTED", "you already submitted a keyword");
            if (!GiaiMaTurn.KeywordWindowOpen(state, loaded.Now))
                throw new RuleError("NO_WINDOW",
                    "the keyword window has closed — the countdown ran out");

            var (nextState, facts) = GiaiMaApplier.Apply(state,
                new LiveAction.GiaiMaSubmitKeyword(
                    ctx.UserId.ToString(), keywordQuestion.Id, textValue.Value,
                    suggestion == Verdict.CORRECT ? VerdictSuggestion.CORRECT : VerdictSuggestion.INCORRECT),
                new GiaiMaContext(ctx.UserId.ToString(), current.RoundId,
                    DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ"),
                    RoundRules.ResolveGiaiMa(loaded.Match.RoundConfigsMap.GetValueOrDefault(current.RoundId)),
                    "", []));

            return ToTransition(nextState, facts);
        });

        await BroadcastAsync(ctx.MatchId, "ping.mp3");
        return new AnswerResult();
    }

    public async Task<object> SubmitVeDichCommandAsync(Guid matchId, Guid userId, string command,
        DateTimeOffset? pressedAt = null)
    {
        var ctx = new SubmitContext(matchId, userId, Guid.Empty, default, PressedAt: pressedAt);
        var loaded = await LoadContextAsync(ctx);
        if (loaded.Live.RoundId != "ve-dich")
            throw new SubmitError(409, "NO_ROUND", $"round {loaded.Live.RoundId} is not ve-dich");

        var action = command switch
        {
            "buzz" => (LiveAction)new LiveAction.VeDichBuzz(userId.ToString()),
            _ => throw new SubmitError(400, "BAD_COMMAND", "unknown command")
        };

        var applied = await ApplyVeDichAsync(loaded, userId, action,
            ClampedPressIso(ctx, loaded.Now), new PgLiveStore(db, matchId));

        await BroadcastAsync(matchId, Sfx.FileFor(action, applied.State, applied.RoundId));
        return new { applied = command };
    }

    private sealed record BuzzDispatch(TieBreakState? TieBreak, LiveRecord<JsonElement>? Live);

    public async Task<object> SubmitBuzzAsync(Guid matchId, Guid userId, DateTimeOffset? pressedAt = null)
    {
        var ctx = new SubmitContext(matchId, userId, Guid.Empty, default, PressedAt: pressedAt);
        var loaded = await LoadContextAsync(ctx);
        var pressed = ClampedPressIso(ctx, loaded.Now);

        var store = new TieBreakStore(db, matchId);
        var dispatch = await store.TransactLive(async (liveTx, tieTx) =>
        {
            if (tieTx.Load() is { Ended: false } running)
            {
                var next = TieBreakTurn.Buzz(running, userId.ToString(), pressed);
                tieTx.Save(next);
                return new BuzzDispatch(next, null);
            }

            var current = await liveTx.Load();
            if (current.RoundId != "ve-dich")
                throw new SubmitError(409, "NO_ROUND", $"round {current.RoundId} is not ve-dich");

            var applied = await ApplyVeDichAsync(loaded, userId, new LiveAction.VeDichBuzz(userId.ToString()),
                pressed, new LiveTxStore<JsonElement>(liveTx));
            return new BuzzDispatch(null, applied);
        });

        if (dispatch.TieBreak is { } tieBreakState)
        {
            await hub.PublishAsync(matchId.ToString());
            return tieBreakState;
        }

        if (dispatch.Live is not { } live)
            throw new InvalidOperationException("buzz dispatch produced no round");

        await BroadcastAsync(matchId,
            Sfx.FileFor(new LiveAction.VeDichBuzz(userId.ToString()), live.State, live.RoundId));
        return new { applied = "buzz" };
    }

    private async Task<LiveRecord<JsonElement>> ApplyVeDichAsync(
        Loaded loaded, Guid userId, LiveAction action, string pressed, ILiveStore<JsonElement> store)
    {
        return await Apply.MutateLive(store, async tx =>
        {
            var current = await tx.Load();
            var state = LiveState.ParseVeDich(current.State);
            var (nextState, facts) = VeDichApplier.Apply(state, action,
                new VeDichApplier.VeDichContext(
                    userId.ToString(), current.RoundId, pressed,
                    RoundRules.ResolveVeDich(
                        loaded.Match.RoundConfigsMap.GetValueOrDefault(current.RoundId)),
                    [], [], []));
            return ToTransition(nextState, facts);
        });
    }

    private static SubmittedAnswerValue ParseValue(JsonElement raw)
    {
        try
        {
            var value = raw.Deserialize<SubmittedAnswerValue>(JsonApi.Options);
            if (value is null) throw new JsonException();
            return value;
        }
        catch (Exception ex) when (ex is JsonException or NotSupportedException)
        {
            throw new SubmitError(400, "BAD_VALUE", "invalid answer value");
        }
    }

}
