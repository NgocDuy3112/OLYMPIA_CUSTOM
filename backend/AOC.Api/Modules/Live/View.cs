using System.Text.Json;
using AOC.Api.Shared;
using AOC.Infrastructure.Data;
using AOC.Domain.Contracts;
using AOC.Domain.Engine;
using AOC.Domain.Engine.Turns;

namespace AOC.Api.Modules.Live;

public sealed record ScoreRow(string Id, string DisplayName, int Points);

public sealed record RankedScore(string Id, string DisplayName, int Points, int Rank);

public sealed record SubmittedAnswerRow(string QuestionId, bool Judged, Verdict? Verdict);

public sealed record JudgedRow(string QuestionId, string UserId, Verdict? Verdict);

/// <summary>Port of live/view.ts — the projection each player/console receives.</summary>
public static class LiveView
{
    private static readonly string[] PublishesVerdicts = ["khoi-dong", "but-pha", "ve-dich"];

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
        bool RevealAll = false);

    private static string PlusSeconds(string iso, double seconds)
    {
        var ms = DateTimeOffset.Parse(iso).ToUnixTimeMilliseconds() + (long)(seconds * 1000);
        return DateTimeOffset.FromUnixTimeMilliseconds(ms)
            .UtcDateTime.ToString("yyyy-MM-ddTHH:mm:ss.fffZ");
    }

    // ---- per-round views -----------------------------------------------------------

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

    public static List<RankedScore> RankTable(List<ScoreRow>? table)
    {
        table ??= [];
        var sorted = table.OrderByDescending(r => r.Points).ToList();
        var ranked = new List<RankedScore>();
        var rank = 0;
        int? lastPoints = null;
        for (var index = 0; index < sorted.Count; index++)
        {
            var row = sorted[index];
            if (row.Points != lastPoints)
            {
                rank = index + 1;
                lastPoints = row.Points;
            }
            ranked.Add(new RankedScore(row.Id, row.DisplayName, row.Points, rank));
        }
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
        var windowOpen = state.OpenHint is not null && state.OpenHintAt is not null
            && GiaiMaTurn.IsWindowOpen(state, input.Now);
        var open = new List<object?>();
        if (windowOpen)
        {
            open.Add(new Dictionary<string, object?>
            {
                ["questionId"] = state.OpenHint,
                ["deadlineAt"] = PlusSeconds(state.OpenHintAt!, 15),
                ["question"] = QuestionOf(input, state.OpenHint!)
            });
        }

        var keywordQuestion = (input.Questions ?? []).FirstOrDefault(q => q.Kind == QuestionKind.KEYWORD);

        string answerState = "none";
        if (open.Count > 0)
        {
            var openQuestionId = ((Dictionary<string, object?>)open[0]!)["questionId"]!.ToString()!;
            answerState = StateOf(input.Submitted, openQuestionId);
        }

        var me = new Dictionary<string, object?>
        {
            ["verdicts"] = VerdictsOf(input.Submitted),
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

        var view = Base(input.MatchId, input.RoundId, input.Version,
            state.Stage, open, RankTable(input.Table), me);
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
        return view;
    }

    private static Dictionary<string, object?> ButPhaView(ViewInput input, ButPhaState state)
    {
        var questionId = ButPhaTurn.OpenQuestionId(state);
        var open = new List<object?>();

        if (questionId is not null && state.QuestionRevealedAt is not null)
        {
            // no clock yet = no deadline: the revealed question stays on screen
            // until Tính giờ starts ticking its30-second window
            double? atS = null;
            if (state.QuestionOpenedAt is not null)
            {
                try
                {
                    atS = ButPhaTurn.ElapsedSeconds(state, input.Now);
                }
                catch (RuleError)
                {
                    atS = double.PositiveInfinity;
                }
            }
            if (atS is null || atS <= 30)
            {
                open.Add(new Dictionary<string, object?>
                {
                    ["questionId"] = questionId,
                    ["deadlineAt"] = state.QuestionOpenedAt is not null
                        ? PlusSeconds(state.QuestionOpenedAt, 30)
                        : null,
                    ["question"] = QuestionOf(input, questionId)
                });
            }
        }

        var me = new Dictionary<string, object?>
        {
            ["points"] = ButPhaTurn.ButPhaTotal(state, input.UserId),
            ["answerState"] = questionId is null ? "none" : StateOf(input.Submitted, questionId),
            ["verdicts"] = VerdictsOf(input.Submitted)
        };

        return Base(input.MatchId, input.RoundId, input.Version,
            state.Ended ? "ended" : "question", open, RankTable(input.Table), me);
    }

    private static Dictionary<string, object?> KhoiDongView(ViewInput input, KhoiDongState state)
    {
        if (state.Stage == "phase1")
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
                state.Ended ? "ended" : "phase1", [], RankTable(input.Table), me);
            if (run is not null && currentId is not null)
            {
                view["oral"] = new Dictionary<string, object?>
                {
                    ["questionId"] = currentId,
                    // nothing is on screen until the console picks who is answering
                    ["question"] = state.Engaged ? QuestionOf(input, currentId) : null,
                    ["playerId"] = state.Engaged ? activeId : null,
                    ["index"] = run.Cursor,
                    ["total"] = run.QuestionIds.Count,
                    ["elapsedS"] = run.ElapsedS,
                    ["budgetS"] = run.BudgetS
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
        var windowOpen = p2 is not null && KhoiDongTurn.IsPhase2WindowOpen(p2, input.Now);

        var open = new List<object?>();
        if (qid is not null && p2 is not null)
        {
            open.Add(new Dictionary<string, object?>
            {
                ["questionId"] = qid,
                ["deadlineAt"] = p2.OpenedAt is null ? null : PlusSeconds(p2.OpenedAt, p2.WindowS),
                ["question"] = QuestionOf(input, qid)
            });
        }

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
            state.Ended ? "ended" : "phase2", open, RankTable(input.Table), p2me);
    }

    private static string? VeDichDeadline(VeDichState state, OpenQuestion open)
    {
        if (open.Stage == "buzz" && state.BuzzOpenedAt is not null)
            return PlusSeconds(state.BuzzOpenedAt, state.Rules.BuzzWindowS);
        if (open.Stage == "current" && open.OpenedAt is not null)
        {
            var seconds = RoundRules.VeDichClockSeconds(state.Rules, open.Question.Value);
            if (seconds is not null) return PlusSeconds(open.OpenedAt, seconds.Value);
        }
        return null;
    }

    private static Dictionary<string, object?> VeDichView(ViewInput input, VeDichState state)
    {
        var player = state.Players.FirstOrDefault(p => p.Id == input.UserId);
        var open = state.Open;

        var openList = new List<object?>();
        if (open is not null)
        {
            openList.Add(new Dictionary<string, object?>
            {
                ["questionId"] = open.Question.Id,
                ["deadlineAt"] = VeDichDeadline(state, open),
                ["question"] = open.Revealed || input.RevealAll
                    ? QuestionOf(input, open.Question.Id)
                    : null
            });
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
            var allowed = new[] { open.Answerer, open.AssignedTo, open.Buzzer }
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
            ["powersLeft"] = player?.PowersLeft ?? [],
            ["isMyTurn"] = isMyTurn,
            ["pendingPicks"] = state.PendingPicks.Select(q => q.Id).ToList(),
            ["isAnswerer"] = open?.Answerer == input.UserId,
            ["canAnswer"] = open is not null && open.Stage == "current"
                && (state.Phase == 1 || open.Answerer == input.UserId),
            ["canBuzz"] = open is not null && open.Stage == "buzz" && open.Buzzer is null
                && VeDichTurn.MayBuzz(state, input.UserId) && VeDichTurn.IsBuzzOpen(state, input.Now),
            ["power"] = open?.Power,
            ["buzzer"] = open?.Buzzer,
            ["buzzerMs"] = open?.BuzzerMs,
            ["answerState"] = open is null ? "none" : StateOf(input.Submitted, open.Question.Id),
            ["verdicts"] = VerdictsOf(input.Submitted)
        };

        var view = Base(input.MatchId, input.RoundId, input.Version,
            state.Ended ? "ended" : $"phase{state.Phase}", openList, RankTable(input.Table), me);
        view["board"] = board;
        if (audioGate is not null) view["audioGate"] = audioGate;
        return view;
    }

    // ---- entry -----------------------------------------------------------------------

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
            ["verdict"] = row.Verdict!.Value.ToString()
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
            RankTable(input.Table), [])
    };

    private static Dictionary<string, object?> WithReveal(ViewInput input, Dictionary<string, object?> view)
    {
        var questionId = input.State switch
        {
            GiaiMaState g => g.RevealedAnswer,
            ButPhaState b => b.RevealedAnswer,
            KhoiDongState k => k.RevealedAnswer,
            VeDichState v => v.RevealedAnswer,
            _ => null
        };
        if (questionId is null) return view;

        bool KhoiDongStillShowing(KhoiDongState state)
        {
            if (state.Stage == "phase2")
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
        var answer = question is null ? null : QuestionView.AnswerDisplay(question);
        if (answer is null) return view;

        view["revealed"] = new Dictionary<string, object?>
        {
            ["questionId"] = questionId,
            ["answer"] = answer
        };
        return view;
    }
}

/// <summary>Port of live/routes.ts helpers shared with hubs.</summary>
public static class LiveFacts
{
    public static bool IsRoundEnded(string roundId, JsonElement raw)
    {
        if (raw.ValueKind != JsonValueKind.Object || !raw.EnumerateObject().Any()) return false;
        return roundId switch
        {
            "giai-ma" => LiveState.ParseGiaiMa(raw).Stage == "ended",
            "but-pha" => LiveState.ParseButPha(raw).Ended,
            "khoi-dong" => LiveState.ParseKhoiDong(raw).Ended,
            "ve-dich" => LiveState.ParseVeDich(raw).Ended,
            _ => true
        };
    }

    public static Dictionary<string, object?>? ConsoleFacts(string roundId, JsonElement raw)
    {
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
                return new Dictionary<string, object?>
                {
                    ["phase"] = state.Phase,
                    ["turnPlayerId"] = state.TurnIndex < state.Players.Count
                        ? state.Players[state.TurnIndex].Id : null,
                    ["openStage"] = state.Open?.Stage,
                    ["revealed"] = state.Open?.Revealed ?? false,
                    ["clockStarted"] = state.Open is not null
                        && (state.Open.Stage == "buzz"
                            ? state.BuzzOpenedAt is not null
                            : state.Open.OpenedAt is not null),
                    ["answererId"] = state.Open?.Answerer,
                    ["buzzerId"] = state.Open?.Buzzer,
                    ["buzzerMs"] = state.Open?.BuzzerMs,
                    ["power"] = state.Open?.Power,
                    ["assignedToId"] = state.Open?.AssignedTo,
                    ["pendingQuestionId"] = state.PendingPicks.Count > 0 ? state.PendingPicks[0].Id : null,
                    ["pendingValues"] = state.PendingPicks.Select(q => q.Value).ToList(),
                    ["turnPicked"] = state.TurnPicked,
                    ["stagedPower"] = state.StagedPower is { } sp
                        ? new Dictionary<string, object?> { ["power"] = sp.Power, ["targetId"] = sp.TargetId }
                        : null,
                    ["turnPowerUsed"] = state.TurnPowerUsed ?? false
                };
            }
            case "khoi-dong":
            {
                var state = LiveState.ParseKhoiDong(raw);
                var p2 = state.Phase2;
                return new Dictionary<string, object?>
                {
                    ["stage"] = state.Stage,
                    ["ended"] = state.Ended,
                    ["phase2Begun"] = p2 is not null,
                    ["phase2Closed"] = p2?.Closed ?? false,
                    ["questionIndex"] = p2?.Index ?? 0,
                    ["questionCount"] = p2?.QuestionIds.Count ?? 0,
                    ["windowOpen"] = p2 is not null
                        && KhoiDongTurn.IsPhase2WindowOpen(p2, DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ"))
                };
            }
            case "but-pha":
            {
                var state = LiveState.ParseButPha(raw);
                return new Dictionary<string, object?>
                {
                    ["questionId"] = ButPhaTurn.OpenQuestionId(state),
                    ["opened"] = state.QuestionRevealedAt is not null,
                    ["clockStarted"] = state.QuestionOpenedAt is not null
                };
            }
            default:
                return new Dictionary<string, object?>();
        }
    }

    /// <summary>Strip answer payloads the audience must not see.</summary>
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

            // Rebuild the question with the sanitized payload.
            var json = JsonSerializer.SerializeToElement(q, JsonDefaults.Options)
                .Deserialize<Dictionary<string, JsonElement>>()!;
            json["payload"] = safePayload;
            return JsonSerializer
                .SerializeToElement(json, JsonDefaults.Options)
                .Deserialize<MatchQuestion>(JsonDefaults.Options)!;
        }).ToList();
}
