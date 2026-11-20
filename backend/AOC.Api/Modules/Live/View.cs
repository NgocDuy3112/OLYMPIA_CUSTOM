using System.Text.Json;
using AOC.Api.Shared;
using AOC.Infrastructure.Data;
using AOC.Domain.Contracts;
using AOC.Domain.Gameplay;
using AOC.Domain.Gameplay.Turns;

namespace AOC.Api.Modules.Live;

public sealed record ScoreRow(string Id, string DisplayName, int Points);

public sealed record RankedScore(string Id, string DisplayName, int Points, int Rank);

public sealed record SubmittedAnswerRow(string QuestionId, bool Judged, Verdict? Verdict, int? AnsweredMs = null, Verdict? Suggestion = null);

public sealed record JudgedRow(string QuestionId, string UserId, Verdict? Verdict, int? AnsweredMs = null);

public sealed record RevealedAnswerRow(string UserId, AnswerValue Value, Verdict? Verdict, int? AnsweredMs = null);

public static class LiveView
{
    private static readonly string[] PublishesVerdicts = ["khoi-dong", "but-pha", "ve-dich", "giai-ma"];

    public sealed record ViewInput(
        string MatchId,
        string RoundId,
        int Version,
        string Now,
        string UserId,
        object State,
        List<SubmittedAnswerRow> Submitted,
        List<JudgedRow>? Judged = null,
        List<MatchQuestion>? Questions = null,
        List<ScoreRow>? Table = null,
        bool RevealAll = false,
        List<RevealedAnswerRow>? RevealedAnswers = null,
        IReadOnlyDictionary<string, int>? TieBreak = null);

    private static string PlusSeconds(string iso, double seconds)
    {
        var ms = DateTimeOffset.Parse(iso).ToUnixTimeMilliseconds() + (long)(seconds * 1000);
        return DateTimeOffset.FromUnixTimeMilliseconds(ms)
            .UtcDateTime.ToString("yyyy-MM-ddTHH:mm:ss.fffZ");
    }


    private static Dictionary<string, object?> Base(string matchId, string roundId, int version,
        string stage, List<object?> open, List<RankedScore> table, Dictionary<string, object?> me)
    {
        var view = new Dictionary<string, object?>
        {
            ["matchId"] = matchId,
            ["roundId"] = roundId,
            ["version"] = version,
            ["stage"] = stage,
            ["open"] = open,
            ["table"] = table,
            ["me"] = me
        };
        return view;
    }

    private static object? QuestionOf(ViewInput input, string questionId)
    {
        var question = (input.Questions ?? []).FirstOrDefault(q => q.Id == questionId);
        return question is null ? null : QuestionView.Sanitize(question);
    }

    private static string? DeadlineWhileOpen(AnswerWindow window, string nowIso)
        => window.IsOpen(nowIso) ? window.Deadline() : null;

    private static string? DeadlineOnceStarted(AnswerWindow window)
        => window.HasStarted ? window.Deadline() : null;

    private static bool WindowOpen(AnswerWindow window, string nowIso) => window.IsOpen(nowIso);

    private static Dictionary<string, object?> OpenEntry(string questionId, string? deadlineAt,
        object? question, long? frozenRemainingMs = null)
    {
        var entry = new Dictionary<string, object?>
        {
            ["questionId"] = questionId,
            ["deadlineAt"] = deadlineAt
        };
        if (frozenRemainingMs is not null) entry["frozenRemainingMs"] = frozenRemainingMs;
        entry["question"] = question;
        return entry;
    }

    public static List<RankedScore> RankTable(
        List<ScoreRow>? table, IReadOnlyDictionary<string, int>? tieBreak = null)
    {
        table ??= [];
        int TieOf(ScoreRow row)
            => tieBreak is not null && tieBreak.TryGetValue(row.Id, out var points) ? points : 0;

        var sorted = table
            .OrderByDescending(r => r.Points)
            .ThenByDescending(TieOf)
            .ToList();
        var rankById = new Dictionary<string, int>();
        var rank = 0;
        (int Points, int Tie)? last = null;
        for (var index = 0; index < sorted.Count; index++)
        {
            var row = sorted[index];
            var key = (row.Points, TieOf(row));
            if (last is null || key != last.Value)
            {
                rank = index + 1;
                last = key;
            }
            rankById[row.Id] = rank;
        }

        var ranked = new List<RankedScore>();
        foreach (var row in table)
            ranked.Add(new RankedScore(row.Id, row.DisplayName, row.Points, rankById[row.Id]));
        return ranked;
    }

    private static string StateOf(List<SubmittedAnswerRow> submitted, string questionId)
    {
        var row = submitted.FirstOrDefault(s => s.QuestionId == questionId);
        if (row is null) return "none";
        return row.Judged ? "final" : "draft";
    }

    private static Dictionary<string, string> VerdictsOf(List<SubmittedAnswerRow> submitted)
        => submitted
            .Where(row => row.Verdict is not null)
            .ToDictionary(row => row.QuestionId, row => row.Verdict!.Value.ToString());

    private static Dictionary<string, object?> GiaiMaView(ViewInput input, GiaiMaState state)
    {
        var player = state.Players.FirstOrDefault(p => p.Id == input.UserId);
        var open = new List<object?>();
        var hintsLocked = state.HintWindow.Locked;
        var openHintContent = QuestionOf(input, state.OpenHint!);
        if (hintsLocked && !string.IsNullOrEmpty(input.UserId))
        {
            var row = input.Submitted.FirstOrDefault(s => s.QuestionId == state.OpenHint);
            var hintVerdict = row is null ? null : (row.Judged ? row.Verdict : row.Suggestion) ?? row.Verdict;
            if (hintVerdict != Verdict.CORRECT) openHintContent = null;
        }

        if (state.OpenHint is not null)
        {
            open.Add(OpenEntry(state.OpenHint,
                DeadlineWhileOpen(state.HintWindow, input.Now), openHintContent));
        }

        var keywordQuestion = (input.Questions ?? []).FirstOrDefault(q => q.Kind == QuestionKind.KEYWORD);
        var keywordCompact = "";
        var keywordKind = "mixed";
        if (keywordQuestion?.Payload is QuestionPayload.Keyword kwPayload)
        {
            keywordCompact = kwPayload.Code.Replace(" ", "");
            keywordKind = keywordCompact.Length == 0 ? "mixed"
                : keywordCompact.All(char.IsDigit) ? "digits"
                : keywordCompact.All(char.IsLetter) ? "letters"
                : "mixed";
        }
        var keywordRevealed = state.RevealedAnswer is not null && keywordQuestion is not null
            && state.RevealedAnswer == keywordQuestion.Id;

        string answerState = "none";
        if (open.Count > 0)
        {
            var openQuestionId = ((Dictionary<string, object?>)open[0]!)["questionId"]!.ToString()!;
            answerState = StateOf(input.Submitted, openQuestionId);
        }

        var hintTiles = (input.Questions ?? [])
            .Where(q => q.Kind == QuestionKind.HINT)
            .OrderBy(q => q.Position)
            .Select((q, index) => new { q.Id, Tile = index })
            .ToDictionary(x => x.Id, x => x.Tile);
        var openTile = state.OpenHint is not null && hintTiles.TryGetValue(state.OpenHint, out var tile)
            ? tile
            : (int?) null;

        var me = new Dictionary<string, object?>
        {
            ["verdicts"] = VerdictsOf(input.Submitted),
            ["openTile"] = openTile,
            ["pickedTiles"] = state.Picked
                .Where(p => hintTiles.ContainsKey(p))
                .Select(p => hintTiles[p])
                .ToList(),
            ["keywordLocked"] = player?.KeywordLocked ?? false,
            ["eliminated"] = player?.Eliminated ?? false,
            ["keywordValue"] = player is null ? null : GiaiMaTurn.KeywordValueFor(state, input.UserId),
            ["revealedHints"] = (player?.Revealed ?? []).Select(questionId => (object)new Dictionary<string, object?>
            {
                ["questionId"] = questionId,
                ["question"] = QuestionOf(input, questionId)
            }).ToList(),
            ["hintsRevealed"] = player?.HintsRevealed ?? 0,
            ["answerState"] = answerState
        };

        var keywordDeadlineAt = GiaiMaTurn.KeywordWindowRunning(state, input.Now)
            ? state.KeywordClosesAt
            : null;
        var view = Base(input.MatchId, input.RoundId, input.Version,
            state.Step, open, RankTable(input.Table, input.TieBreak), me);
        view["keywordDeadlineAt"] = keywordDeadlineAt;
        view["keywordLength"] = keywordCompact.Length;
        view["keywordKind"] = keywordKind;
        if (keywordQuestion is null)
        {
            view["keyword"] = null;
        }
        else
        {
            view["keyword"] = new Dictionary<string, object?>
            {
                ["questionId"] = keywordQuestion.Id,
                ["question"] = QuestionView.Sanitize(keywordQuestion)
            };
        }
        if (keywordRevealed && keywordQuestion!.Payload is QuestionPayload.Keyword keywordPayload)
        {
            view["keywordCode"] = keywordPayload.Code;
        }
        var hintAnswers = new Dictionary<string, object?>();
        var hintVerdicts = new Dictionary<string, object?>();
        var consoleView = string.IsNullOrEmpty(input.UserId);
        foreach (var pair in hintTiles)
        {
            var isPicked = state.Picked.Contains(pair.Key);
            var row = consoleView || !isPicked
                ? null
                : input.Submitted.FirstOrDefault(s => s.QuestionId == pair.Key);
            var verdict = row is null ? null : (row.Judged ? row.Verdict : row.Suggestion) ?? row.Verdict;
            if (isPicked) hintVerdicts[$"{pair.Value}"] = verdict?.ToString();

            // opened hints: console always, the answering player when correct.
            // after the keyword is revealed: every hint's answer, everyone.
            var show = keywordRevealed || (isPicked && (consoleView || verdict == Verdict.CORRECT));
            var question = (input.Questions ?? []).FirstOrDefault(q => q.Id == pair.Key);
            if (show && question?.Payload is QuestionPayload.Text textPayload && textPayload.AcceptedAnswers.Count > 0)
                hintAnswers[$"{pair.Value}"] = textPayload.AcceptedAnswers[0];
        }
        view["hintAnswers"] = hintAnswers;

        var meHintVerdicts = new Dictionary<string, object?>(hintVerdicts);
        me["hintVerdicts"] = meHintVerdicts;
        return view;
    }

    private static Dictionary<string, object?> ButPhaView(ViewInput input, ButPhaState state)
    {
        var questionId = ButPhaTurn.OpenQuestionId(state);
        var open = new List<object?>();

        if (questionId is not null && state.QuestionRevealedAt is not null)
        {
            open.Add(OpenEntry(questionId, DeadlineOnceStarted(state.Window),
                QuestionOf(input, questionId)));
        }

        var me = new Dictionary<string, object?>
        {
            ["points"] = ButPhaTurn.ButPhaTotal(state, input.UserId),
            ["answerState"] = questionId is null ? "none" : StateOf(input.Submitted, questionId),
            ["verdicts"] = VerdictsOf(input.Submitted)
        };

        return Base(input.MatchId, input.RoundId, input.Version,
            state.Ended ? "ended" : "question", open, RankTable(input.Table, input.TieBreak), me);
    }

    private static Dictionary<string, object?> KhoiDongView(ViewInput input, KhoiDongState state)
    {
        if (state.Flow == Flow.rieng)
        {
            var activeId = KhoiDongRound.ActivePlayerId(state);
            var run = activeId is not null ? state.Runs[activeId] : null;
            var currentId = run is not null && !run.Ended && run.Cursor < run.QuestionIds.Count
                ? run.QuestionIds[run.Cursor]
                : null;

            var me = new Dictionary<string, object?>
            {
                ["isMyRun"] = activeId == input.UserId,
                ["points"] = KhoiDongRound.KhoiDongPoints(state, input.UserId),
                ["verdicts"] = VerdictsOf(input.Submitted)
            };

            var view = Base(input.MatchId, input.RoundId, input.Version,
                state.Ended ? "ended" : "phase1", [], RankTable(input.Table, input.TieBreak), me);
            if (run is not null && currentId is not null)
            {
                view["oral"] = new Dictionary<string, object?>
                {
                    ["questionId"] = currentId,
                    ["question"] = state.ClockStarted ? QuestionOf(input, currentId) : null,
                    ["playerId"] = activeId,
                    ["index"] = run.Cursor,
                    ["total"] = run.QuestionIds.Count,
                    ["elapsedS"] = run.ElapsedS,
                    ["budgetS"] = run.BudgetS,
                    ["deadlineAt"] = state.ClockStartedAt is null
                        ? null
                        : PlusSeconds(state.ClockStartedAt, run.BudgetS)
                };
            }
            else
            {
                view["oral"] = null;
            }
            return view;
        }

        var p2 = state.Phase2;
        var qid = p2 is null ? null : KhoiDongTurn.Phase2QuestionId(p2);
        var windowOpen = p2 is not null && !p2.Closed && WindowOpen(p2.Window, input.Now);

        var open = new List<object?>();
        if (qid is not null && p2 is not null)
        {
            open.Add(OpenEntry(qid, DeadlineOnceStarted(p2.Window), QuestionOf(input, qid)));
        }
        // with Index = -1 nothing is picked yet: qid is null, so no question leaks

        var p2me = new Dictionary<string, object?>
        {
            ["points"] = KhoiDongRound.KhoiDongPoints(state, input.UserId),
            ["answerState"] = qid is null ? "none" : StateOf(input.Submitted, qid),
            ["windowOpen"] = windowOpen,
            ["questionIndex"] = p2?.Index ?? 0,
            ["questionCount"] = p2?.QuestionIds.Count ?? 0,
            ["verdicts"] = VerdictsOf(input.Submitted)
        };

        return Base(input.MatchId, input.RoundId, input.Version,
            state.Ended ? "ended" : "phase2", open, RankTable(input.Table, input.TieBreak), p2me);
    }

    internal static string? StageOfWindow(OpenQuestion? open)
    {
        if (open is null) return null;
        if (open.Window.Mode == AnswerMode.Buzz) return "buzz";
        return "current";
    }

    internal static string? AssignedToId(OpenQuestion? open)
        => open is null || open.Window.Eligibility != AnswerEligibility.Pair
            ? null
            : open.Window.PairB;

    internal static Dictionary<string, object?>? StagedPowerOf(VeDichPlayerState? player)
    {
        var staged = player?.Powers.Staged;
        if (staged is null) return null;
        return new Dictionary<string, object?>
        {
            ["power"] = staged.Power,
            ["targetId"] = staged.TargetId
        };
    }

    private static bool CanBuzz(OpenQuestion? open, string playerId, string nowIso)
    {
        if (open is null) return false;
        if (open.Window.Mode != AnswerMode.Buzz) return false;
        if (open.Window.Buzzer is not null) return false;
        if (!open.Window.IsOpen(nowIso)) return false;

        if (open.Window.Eligibility == AnswerEligibility.Others)
            return playerId != open.Window.TurnPlayerId;
        if (open.Window.Eligibility == AnswerEligibility.Pair)
            return playerId == open.Window.PairA || playerId == open.Window.PairB;
        return false;
    }

    private static Dictionary<string, object?> VeDichView(ViewInput input, VeDichState state)
    {
        var player = state.Players.FirstOrDefault(p => p.Id == input.UserId);
        var open = state.Open;

        var openList = new List<object?>();
        if (open is not null)
        {
            long? frozenRemainingMs = null;
            if (open.Window.Mode == AnswerMode.Buzz
                && open.Window.Buzzer is not null
                && open.Window.HasStarted)
            {
                var seconds = open.Window.Seconds
                    ?? throw new LiveStateError("open.window.seconds: expected integer", ["open.window"]);
                frozenRemainingMs = Math.Max(0,
                    seconds * 1000 - open.Window.ElapsedMs(input.Now));
            }
            var entry = OpenEntry(open.Question.Id,
                frozenRemainingMs is null ? DeadlineOnceStarted(open.Window) : null,
                open.Revealed || input.RevealAll ? QuestionOf(input, open.Question.Id) : null,
                frozenRemainingMs);
            entry["frozenRemainingMs"] = frozenRemainingMs;
            openList.Add(entry);
        }

        var openId = open?.Question.Id;
        var pendingIds = state.PendingPicks.Select(q => q.Id).ToHashSet();
        var freeIds = state.Remaining.Select(q => q.Id).ToHashSet();
        var deferredIds = (state.Deferred ?? []).Select(q => q.Id).ToHashSet();

        var board = (input.Questions ?? [])
            .Where(q => q.RoundId == "ve-dich")
            .Select(q =>
            {
                string where;
                if (q.Id == openId)
                {
                    where = "open";
                }
                else if (pendingIds.Contains(q.Id))
                {
                    where = "pending";
                }
                else if (freeIds.Contains(q.Id))
                {
                    where = "free";
                }
                else if (deferredIds.Contains(q.Id) || (state.Phase == 1 && q.Points > 30))
                {
                    where = "deferred";
                }
                else
                {
                    where = "taken";
                }
                return (object)new Dictionary<string, object?>
                {
                    ["questionId"] = q.Id,
                    ["value"] = q.Points,
                    ["where"] = where
                };
            })
            .ToList();

        Dictionary<string, object?>? audioGate = null;
        if (state.Phase == 2 && open is not null)
        {
            var allowed = new[]
            {
                open.Answerer, open.Window.PairA, open.Window.PairB, open.Window.Buzzer
            }
                .Where(id => !string.IsNullOrEmpty(id))
                .Distinct()
                .Cast<string>()
                .ToList();
            audioGate = new Dictionary<string, object?> { ["allowed"] = allowed };
        }

        var isMyTurn = !state.Ended && open is null
            && state.Players.Count > state.TurnIndex
            && state.Players[state.TurnIndex].Id == input.UserId;

        var me = new Dictionary<string, object?>
        {
            ["score"] = player?.Score ?? 0,
            ["powersLeft"] = player?.Powers.Available ?? [],
            ["isMyTurn"] = isMyTurn,
            ["pendingPicks"] = state.PendingPicks.Select(q => q.Id).ToList(),
            ["isAnswerer"] = open?.Answerer == input.UserId,
            ["canAnswer"] = open is not null && open.Window.Mode == AnswerMode.Oral
                && (state.Phase == 1 || open.Answerer == input.UserId),
            ["canBuzz"] = CanBuzz(open, input.UserId, input.Now),
            ["power"] = open?.Power,
            ["buzzer"] = open?.Window.Buzzer,
            ["buzzerMs"] = open?.Window.BuzzerMs,
            ["answerState"] = open is null ? "none" : StateOf(input.Submitted, open.Question.Id),
            ["verdicts"] = VerdictsOf(input.Submitted)
        };

        var view = Base(input.MatchId, input.RoundId, input.Version,
            state.Ended ? "ended" : $"phase{state.Phase}", openList, RankTable(input.Table, input.TieBreak), me);
        view["board"] = board;
        if (audioGate is not null) view["audioGate"] = audioGate;
        string? turnPlayerId = null;
        if (state.TurnIndex < state.Players.Count) turnPlayerId = state.Players[state.TurnIndex].Id;
        view["turnPlayerId"] = turnPlayerId;
        view["answererId"] = state.Open?.Answerer;
        view["assignedToId"] = AssignedToId(state.Open);
        view["stagedPower"] = StagedPowerOf(
            state.TurnIndex < state.Players.Count ? state.Players[state.TurnIndex] : null);
        return view;
    }


    public static Dictionary<string, object?> BuildPlayerView(ViewInput input)
    {
        var view = WithReveal(input, RoundViewOf(input));
        if (!PublishesVerdicts.Contains(input.RoundId)) return view;

        var judged = (input.Judged ?? []).Where(row => row.Verdict is not null).ToList();
        if (judged.Count == 0) return view;

        view["publicVerdicts"] = judged.Select(row => (object)new Dictionary<string, object?>
        {
            ["questionId"] = row.QuestionId,
            ["userId"] = row.UserId,
            ["verdict"] = row.Verdict!.Value.ToString(),
            ["answeredMs"] = row.AnsweredMs
        }).ToList();
        return view;
    }

    private static Dictionary<string, object?> RoundViewOf(ViewInput input) => input.RoundId switch
    {
        "giai-ma" => GiaiMaView(input, (GiaiMaState)input.State),
        "but-pha" => ButPhaView(input, (ButPhaState)input.State),
        "khoi-dong" => KhoiDongView(input, (KhoiDongState)input.State),
        "ve-dich" => VeDichView(input, (VeDichState)input.State),
        _ => Base(input.MatchId, input.RoundId, input.Version, "unknown", [],
            RankTable(input.Table, input.TieBreak), [])
    };

    public static string? RevealedIdOf(object state) => state switch
    {
        GiaiMaState g => g.RevealedAnswer,
        ButPhaState b => b.RevealedAnswer,
        KhoiDongState k => k.RevealedAnswer,
        VeDichState v => v.RevealedAnswer,
        _ => null
    };

    private static Dictionary<string, object?> WithReveal(ViewInput input, Dictionary<string, object?> view)
    {
        var questionId = RevealedIdOf(input.State);
        if (questionId is null) return view;

        bool KhoiDongStillShowing(KhoiDongState state)
        {
            if (state.Flow == Flow.chung)
            {
                if (state.Phase2 is null) return false;
                return KhoiDongTurn.Phase2QuestionId(state.Phase2) == questionId;
            }

            var activeId = KhoiDongRound.ActivePlayerId(state);
            if (activeId is null) return false;
            if (!state.Runs.TryGetValue(activeId, out var run)) return false;
            if (run.Ended) return false;
            if (run.Cursor >= run.QuestionIds.Count) return false;
            return run.QuestionIds[run.Cursor] == questionId;
        }

        var stillShowing = input.RoundId switch
        {
            "khoi-dong" => KhoiDongStillShowing((KhoiDongState)input.State),
            "but-pha" => ButPhaTurn.OpenQuestionId((ButPhaState)input.State) == questionId,
            "ve-dich" => ((VeDichState)input.State).Open?.Question.Id == questionId,
            "giai-ma" =>
                ((GiaiMaState)input.State) is var gm && (
                    (input.Questions ?? []).FirstOrDefault(q => q.Kind == QuestionKind.KEYWORD)?.Id == questionId
                    || (gm.OpenHint ?? gm.Picked.LastOrDefault()) is { } current && current == questionId),
            _ => false
        };
        if (!stillShowing) return view;

        var question = (input.Questions ?? []).FirstOrDefault(q => q.Id == questionId);
        var contestants = new List<object?>();
        foreach (var row in input.RevealedAnswers ?? [])
        {
            var name = input.Table?.FirstOrDefault(t => t.Id == row.UserId)?.DisplayName ?? row.UserId;
            contestants.Add(new Dictionary<string, object?>
            {
                ["userId"] = row.UserId,
                ["name"] = name,
                ["answer"] = QuestionView.AnswerRowDisplay(row.Value, question),
                ["verdict"] = row.Verdict?.ToString(),
                ["answeredMs"] = row.AnsweredMs
            });
        }
        if (contestants.Count == 0) return view;

        view["revealed"] = new Dictionary<string, object?>
        {
            ["contestants"] = contestants
        };
        return view;
    }
}

public static class LiveFacts
{
    public static JsonElement WaitingMarker() =>
        JsonSerializer.SerializeToElement(new { waiting = true }, JsonApiOptions.Options);

    public static bool IsWaitingState(JsonElement raw)
    {
        if (raw.ValueKind != JsonValueKind.Object) return false;
        foreach (var prop in raw.EnumerateObject())
        {
            if (prop.Name == "waiting") return prop.Value.ValueKind == JsonValueKind.True;
        }
        return false;
    }

    public static bool IsRoundEnded(string roundId, JsonElement raw)
    {
        if (IsWaitingState(raw)) return false;
        if (raw.ValueKind != JsonValueKind.Object || !raw.EnumerateObject().Any()) return false;
        return roundId switch
        {
            "giai-ma" => LiveState.ParseGiaiMa(raw).Step == "ended",
            "but-pha" => LiveState.ParseButPha(raw).Ended,
            "khoi-dong" => LiveState.ParseKhoiDong(raw).Ended,
            "ve-dich" => LiveState.ParseVeDich(raw).Ended,
            _ => true
        };
    }

    public static Dictionary<string, object?>? ConsoleFacts(string roundId, JsonElement raw, string now)
    {
        if (IsWaitingState(raw)) return null;
        if (raw.ValueKind != JsonValueKind.Object || !raw.EnumerateObject().Any()) return null;

        switch (roundId)
        {
            case "giai-ma":
            {
                var state = LiveState.ParseGiaiMa(raw);
                return new Dictionary<string, object?>
                {
                    ["hintsRemaining"] = GiaiMaTurn.RemainingHints(state),
                    ["hintsPicked"] = state.Picked,
                    ["openHintId"] = state.OpenHint,
                    ["windowOpen"] = GiaiMaTurn.IsWindowOpen(state, now),
                    ["hintsLocked"] = state.HintWindow.Locked && state.OpenHint is not null,
                    ["players"] = state.Players.Select(p => (object)new Dictionary<string, object?>
                    {
                        ["id"] = p.Id,
                        ["keywordLocked"] = p.KeywordLocked,
                        ["eliminated"] = p.Eliminated
                    }).ToList()
                };
            }
            case "ve-dich":
            {
                var state = LiveState.ParseVeDich(raw);
                var turnPlayer = state.TurnIndex < state.Players.Count
                    ? state.Players[state.TurnIndex]
                    : null;
                var open = state.Open;
                return new Dictionary<string, object?>
                {
                    ["phase"] = state.Phase,
                    ["turnPlayerId"] = turnPlayer?.Id,
                    ["openStage"] = LiveView.StageOfWindow(open),
                    ["revealed"] = open?.Revealed ?? false,
                    ["clockStarted"] = open is not null && open.Window.HasStarted,
                    ["answererId"] = open?.Answerer,
                    ["buzzerId"] = open?.Window.Buzzer,
                    ["buzzerMs"] = open?.Window.BuzzerMs,
                    ["power"] = open?.Power,
                    ["assignedToId"] = LiveView.AssignedToId(open),
                    ["pendingQuestionId"] = state.PendingPicks.Count > 0 ? state.PendingPicks[0].Id : null,
                    ["pendingValues"] = state.PendingPicks.Select(q => q.Value).ToList(),
                    ["turnPicked"] = state.TurnPicked,
                    ["picksConfirmed"] = state.PicksConfirmed,
                    ["stagedPower"] = LiveView.StagedPowerOf(turnPlayer),
                    ["turnPowerUsed"] = turnPlayer?.Powers.UsedThisTurn ?? false
                };
            }
            case "khoi-dong":
            {
                var state = LiveState.ParseKhoiDong(raw);
                var p2 = state.Phase2;
                return new Dictionary<string, object?>
                {
                    ["stage"] = StageOf(state.Flow),
                    ["ended"] = state.Ended,
                    ["phase2Begun"] = p2 is not null,
                    ["phase2Closed"] = p2?.Closed ?? false,
                    ["questionIndex"] = p2?.Index ?? 0,
                    ["questionCount"] = p2?.QuestionIds.Count ?? 0,
                    ["windowOpen"] = p2 is not null && !p2.Closed
                        && p2.Window.IsOpen(DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ"))
                };
            }
            case "but-pha":
            {
                var state = LiveState.ParseButPha(raw);
                return new Dictionary<string, object?>
                {
                    ["questionId"] = ButPhaTurn.OpenQuestionId(state),
                    ["opened"] = state.QuestionRevealedAt is not null,
                    ["clockStarted"] = state.Window.HasStarted
                };
            }
            default:
                return new Dictionary<string, object?>();
        }
    }

    private static string StageOf(Flow flow) => flow == Flow.rieng ? "phase1" : "phase2";

    public static List<MatchQuestion> PublicQuestions(List<MatchQuestion> questions)
        => questions.Select(q =>
        {
            JsonElement safePayload;
            if (q.Kind == QuestionKind.CHOICE && q.Payload is QuestionPayload.Choice choice)
            {
                safePayload = JsonSerializer.SerializeToElement(
                    new Dictionary<string, object?> { ["options"] = choice.Options }, Http.JsonApi.Options);
            }
            else if (q.Kind == QuestionKind.KEYWORD && q.Payload is QuestionPayload.Keyword keyword)
            {
                safePayload = JsonSerializer.SerializeToElement(
                    new Dictionary<string, object?> { ["codeLength"] = keyword.Code.Length }, Http.JsonApi.Options);
            }
            else
            {
                Dictionary<string, object?> empty = new();
                safePayload = JsonSerializer.SerializeToElement(empty, Http.JsonApi.Options);
            }

            var json = JsonSerializer.SerializeToElement(q, JsonDefaults.Options)
                .Deserialize<Dictionary<string, JsonElement>>()!;
            json["payload"] = safePayload;
            return JsonSerializer
                .SerializeToElement(json, JsonDefaults.Options)
                .Deserialize<MatchQuestion>(JsonDefaults.Options)!;
        }).ToList();
}
