using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using AOC.Api.Http;
using AOC.Api.Modules.Matches;
using AOC.Api.Realtime;
using AOC.Domain.Contracts;
using AOC.Domain.Engine;
using AOC.Domain.Engine.Turns;
using AOC.Infrastructure.Data;
using AOC.Infrastructure.Data.Entities;

namespace AOC.Api.Modules.Live;

/// <summary>Port of live/submit.ts — player answer/keyword submissions with window checks.</summary>
public sealed class SubmitService(
    AOCDbContext db,
    LiveReader reader,
    DraftWriter drafts,
    MatchHubRegistry hub,
    AOC.Infrastructure.Audit.AuditService audit)
{
    public sealed record SubmitContext(
        Guid MatchId,
        Guid UserId,
        Guid QuestionId,
        JsonElement Value,
        string? Ip = null,
        string? UserAgent = null);

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

    private static Verdict Suggestion(MatchQuestion question, SubmittedAnswerValue value)
        => Matching.AutoMatch(question.Kind, question.Payload, value)
            ? Verdict.CORRECT
            : Verdict.INCORRECT;

    private async Task DraftAuditAsync(SubmitContext ctx, string roundId, Verdict suggestion)
    {
        await audit.AuditAsync(new AOC.Infrastructure.Audit.AuditEvent
        {
            Action = "answer_drafted",
            ActorId = null, // the auto-matcher drafted it, not a person
            MatchId = ctx.MatchId,
            Ip = ctx.Ip,
            UserAgent = ctx.UserAgent,
            Details = new Dictionary<string, object?>
            {
                ["roundId"] = roundId,
                ["questionId"] = ctx.QuestionId,
                ["userId"] = ctx.UserId,
                ["suggestion"] = suggestion.ToString()
            }
        });
    }

    public async Task<AnswerResult> SubmitAnswerAsync(SubmitContext ctx)
    {
        var value = ParseValue(ctx.Value);
        var loaded = await LoadContextAsync(ctx);

        switch (loaded.Live.RoundId)
        {
            case "giai-ma":
            {
                var state = LiveState.ParseGiaiMa(loaded.Live.State);
                if (state.OpenHint != ctx.QuestionId.ToString())
                    throw new SubmitError(409, "NO_WINDOW", "no answer window is open for this question");
                if (!GiaiMaTurn.IsWindowOpen(state, loaded.Now))
                    throw new SubmitError(409, "WINDOW_CLOSED", "the answer window has closed");
                if (!GiaiMaTurn.CanPlayerAnswer(state, ctx.UserId.ToString(), loaded.Now))
                    throw new SubmitError(409, "LOCKED", "you can no longer answer this round");

                // the match holds its own copies of the questions (assembly mints new
                // ids), so resolve against the match — the bank never sees them
                var question = loaded.Match.QuestionsList.FirstOrDefault(q => q.Id == ctx.QuestionId.ToString())
                    ?? throw new SubmitError(400, "NOT_IN_MATCH", "question is not part of this match");
                var suggestion = Suggestion(question, value);
                await drafts.WriteDraftAsync(ctx.MatchId, ctx.QuestionId, ctx.UserId,
                    ctx.Value, suggestion);
                await DraftAuditAsync(ctx, loaded.Live.RoundId, suggestion);

                await hub.PublishAsync(ctx.MatchId.ToString());
                return new AnswerResult();
            }

            case "but-pha":
            {
                if (value is not SubmittedAnswerValue.Text)
                    throw new SubmitError(400, "BAD_VALUE", "a but-pha answer must be text");
                var state = LiveState.ParseButPha(loaded.Live.State);
                var openId = ButPhaTurn.OpenQuestionId(state);
                if (openId is null) throw new SubmitError(409, "NO_QUESTION", "no question is open");
                if (openId != ctx.QuestionId.ToString())
                    throw new SubmitError(409, "NOT_OPEN", "that question is not open");

                double atS;
                try
                {
                    atS = ButPhaTurn.ElapsedSeconds(state, loaded.Now);
                }
                catch (RuleError)
                {
                    throw new SubmitError(409, "NO_CLOCK", "the question's clock has not started");
                }
                if (atS > state.Rules.QuestionLimitS)
                    throw new SubmitError(409, "WINDOW_CLOSED", "the answer window has closed");

                // the match holds its own copies of the questions (assembly mints new
                // ids), so resolve against the match — the bank never sees them
                var question = loaded.Match.QuestionsList.FirstOrDefault(q => q.Id == ctx.QuestionId.ToString())
                    ?? throw new SubmitError(400, "NOT_IN_MATCH", "question is not part of this match");
                var suggestion = Suggestion(question, value);
                await drafts.WriteDraftAsync(ctx.MatchId, ctx.QuestionId, ctx.UserId,
                    ctx.Value, suggestion,
                    answeredMs: (int)Math.Round(atS * 1000), revise: false);
                await DraftAuditAsync(ctx, loaded.Live.RoundId, suggestion);

                await hub.PublishAsync(ctx.MatchId.ToString());
                return new AnswerResult();
            }

            case "khoi-dong":
            {
                if (value is not SubmittedAnswerValue.Text)
                    throw new SubmitError(400, "BAD_VALUE", "a chung answer must be text");
                var state = LiveState.ParseKhoiDong(loaded.Live.State);
                if (state.Stage != "phase2" || state.Phase2 is null)
                    throw new SubmitError(409, "NO_WINDOW",
                        "khởi động riêng is oral — there is nothing to type yet");
                var questionId = KhoiDongTurn.Phase2QuestionId(state.Phase2);
                if (questionId is null)
                    throw new SubmitError(409, "ENDED", "every chung question has been played");
                if (questionId != ctx.QuestionId.ToString())
                    throw new SubmitError(409, "NOT_OPEN", "that question is not the one in play");
                if (state.Phase2.OpenedAt is null)
                    throw new SubmitError(409, "NO_WINDOW",
                        "the console has not started the clock for this question yet");
                if (!KhoiDongTurn.IsPhase2WindowOpen(state.Phase2, loaded.Now))
                    throw new SubmitError(409, "WINDOW_CLOSED",
                        "the clock has run out — the answer window is closed");

                // the match holds its own copies of the questions (assembly mints new
                // ids), so resolve against the match — the bank never sees them
                var question = loaded.Match.QuestionsList.FirstOrDefault(q => q.Id == ctx.QuestionId.ToString())
                    ?? throw new SubmitError(400, "NOT_IN_MATCH", "question is not part of this match");
                var suggestion = Suggestion(question, value);
                await drafts.WriteDraftAsync(ctx.MatchId, ctx.QuestionId, ctx.UserId,
                    ctx.Value, suggestion,
                    answeredMs: Math.Max(0,
                        (int)(DateTimeOffset.Parse(loaded.Now).ToUnixTimeMilliseconds()
                            - DateTimeOffset.Parse(state.Phase2.OpenedAt!).ToUnixTimeMilliseconds())));
                await DraftAuditAsync(ctx, loaded.Live.RoundId, suggestion);

                await hub.PublishAsync(ctx.MatchId.ToString());
                return new AnswerResult();
            }

            case "ve-dich":
            {
                if (value is not SubmittedAnswerValue.Text)
                    throw new SubmitError(400, "BAD_VALUE", "a ve-dich phase-1 answer must be text");
                var state = LiveState.ParseVeDich(loaded.Live.State);
                if (state.Ended) throw new SubmitError(409, "ENDED", "the round has ended");
                if (state.Phase != 1) throw new SubmitError(409, "PHASE_CLOSED", "phase 1 is over");

                var open = state.Open;
                if (open is null || open.Question.Id != ctx.QuestionId.ToString())
                    throw new SubmitError(409, "NOT_OPEN", "that question is not open");
                // phase 1 is open to every seated player — the clock bounds the window
                if (open.OpenedAt is null)
                    throw new SubmitError(409, "NO_CLOCK", "the clock has not started yet");
                if (open.Stage != "current")
                    throw new SubmitError(409, "WINDOW_CLOSED", "the answer window has closed");

                // The value-keyed clock bounds the typing window.
                var clock = RoundRules.VeDichClockSeconds(state.Rules, open.Question.Value);
                if (clock is not null && open.OpenedAt is not null)
                {
                    var elapsedMs = DateTimeOffset.Parse(loaded.Now).ToUnixTimeMilliseconds()
                        - DateTimeOffset.Parse(open.OpenedAt).ToUnixTimeMilliseconds();
                    if (elapsedMs > clock.Value * 1000)
                        throw new SubmitError(409, "WINDOW_CLOSED",
                            $"the {clock}s answer window for this {open.Question.Value}-point question has closed");
                }

                // the match holds its own copies of the questions (assembly mints new
                // ids), so resolve against the match — the bank never sees them
                var question = loaded.Match.QuestionsList.FirstOrDefault(q => q.Id == ctx.QuestionId.ToString())
                    ?? throw new SubmitError(400, "NOT_IN_MATCH", "question is not part of this match");
                var suggestion = Suggestion(question, value);
                await drafts.WriteDraftAsync(ctx.MatchId, ctx.QuestionId, ctx.UserId,
                    ctx.Value, suggestion);
                await DraftAuditAsync(ctx, loaded.Live.RoundId, suggestion);

                await hub.PublishAsync(ctx.MatchId.ToString());
                return new AnswerResult();
            }

            default:
                throw new SubmitError(409, "NO_ROUND", $"round {loaded.Live.RoundId} does not accept answers yet");
        }
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

        // lock + draft inside one live mutation
        var store = new PgLiveStore(db, ctx.MatchId);
        await Apply.MutateLive(store, async tx =>
        {
            var current = await tx.Load();
            var state = LiveState.ParseGiaiMa(current.State);
            if (state.Players.FirstOrDefault(p => p.Id == ctx.UserId.ToString())?.KeywordLocked == true)
                throw new RuleError("ALREADY_SUBMITTED", "you already submitted a keyword");

            var (nextState, facts) = GiaiMaApplier.Apply(state,
                new LiveAction.GiaiMaSubmitKeyword(
                    ctx.UserId.ToString(), keywordQuestion.Id, textValue.Value,
                    suggestion == Verdict.CORRECT ? VerdictSuggestion.CORRECT : VerdictSuggestion.INCORRECT),
                new GiaiMaContext(ctx.UserId.ToString(), current.RoundId,
                    DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ"),
                    RoundRules.ResolveGiaiMa(loaded.Match.RoundConfigsMap.GetValueOrDefault(current.RoundId)),
                    "", []));

            return new Transition<JsonElement>(
                JsonSerializer.SerializeToElement(nextState, JsonDefaults.Options), facts);
        });

        // the keyword lands with a ping for the room
        await Sfx.BroadcastAsync(hub, ctx.MatchId.ToString(), "ping.mp3");
        await hub.PublishAsync(ctx.MatchId.ToString());
        return new AnswerResult();
    }

    /// <summary>Port of live/ve-dich-player.ts — the buzz command.</summary>
    public async Task<object> SubmitVeDichCommandAsync(Guid matchId, Guid userId, string command)
    {
        var loaded = await LoadContextAsync(new SubmitContext(matchId, userId, Guid.Empty, default));
        if (loaded.Live.RoundId != "ve-dich")
            throw new SubmitError(409, "NO_ROUND", $"round {loaded.Live.RoundId} is not ve-dich");

        var action = command switch
        {
            "buzz" => (LiveAction)new LiveAction.VeDichBuzz(userId.ToString()),
            _ => throw new SubmitError(400, "BAD_COMMAND", "unknown command")
        };
        var now = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ");

        var store = new PgLiveStore(db, matchId);
        await Apply.MutateLive(store, async tx =>
        {
            var current = await tx.Load();
            var state = LiveState.ParseVeDich(current.State);
            var (nextState, facts) = VeDichApplier.Apply(state, action,
                new VeDichApplier.VeDichContext(
                    userId.ToString(), current.RoundId, now,
                    RoundRules.DefaultVeDich(), [], [], []));
            return new Transition<JsonElement>(
                JsonSerializer.SerializeToElement(nextState, JsonDefaults.Options), facts);
        });

        await Sfx.BroadcastAsync(hub, matchId.ToString(), "ping.mp3");
        await hub.PublishAsync(matchId.ToString());
        return new { applied = command };
    }

    private static SubmittedAnswerValue ParseValue(JsonElement raw)
    {
        try
        {
            var value = raw.Deserialize<SubmittedAnswerValue>(JsonApi.Options);
            if (value is null) throw new JsonException();
            return value;
        }
        catch (JsonException)
        {
            throw new SubmitError(400, "BAD_VALUE", "invalid answer value");
        }
    }

}
