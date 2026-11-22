using System.Text.Json;
using AOC.Api.Shared;
using AOC.Infrastructure.Data;
using AOC.Domain.Contracts;
using AOC.Domain.Gameplay;
using AOC.Domain.Gameplay.Turns;

namespace AOC.Api.Modules.Live;

public static partial class LiveView
{
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

    internal sealed record AudioGate(List<string> Allowed);

    internal sealed record MediaPolicy(
        string Mode, string? TurnPlayerId, string? AnswererId,
        string? AssignedToId, string? BuzzerId, List<string> Allowed);

    private static bool CanAnswerOf(VeDichState state, OpenQuestion? open, string userId)
    {
        if (open is null) return false;
        if (open.Window.Mode != AnswerMode.Typed) return false;
        if (!open.Window.HasStarted) return false;
        if (open.Window.Locked) return false;

        if (open.Window.Eligibility == AnswerEligibility.Everyone) return true;
        if (open.Window.Eligibility == AnswerEligibility.CurrentTurn)
            return open.Window.TurnPlayerId == userId;
        if (open.Window.Eligibility == AnswerEligibility.Pair)
            return open.Window.PairA == userId || open.Window.PairB == userId;
        return false;
    }

    private static string? SelectedPlayerOf(
        VeDichState state, OpenQuestion? open, string? turnPlayerId)
    {
        if (state.Ended) return null;

        if (state.Phase == 1) return null;

        if (open is null) return turnPlayerId;

        var assigned = AssignedToId(open);
        if (assigned is not null) return assigned;
        return open.Answerer;
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

        AudioGate? audioGate = null;
        MediaPolicy? mediaPolicy = null;
        var allowedIds = new List<string>();
        if (state.Phase == 2 && open is not null)
        {
            allowedIds = new[]
            {
                open.Answerer, open.Window.PairA, open.Window.PairB, open.Window.Buzzer
            }
                .OfType<string>()
                .Where(id => id.Length > 0)
                .Distinct()
                .ToList();
            audioGate = new AudioGate(allowedIds);
        }

        var turnPlayerId = state.TurnIndex < state.Players.Count ? state.Players[state.TurnIndex].Id : null;
        if (state.Phase == 2)
        {
            string mode = "countdown";
            if (open is null) mode = "all";
            else if (open.Window.Eligibility == AnswerEligibility.Pair) mode = "assign";

            mediaPolicy = new MediaPolicy(mode, turnPlayerId, open?.Answerer,
                AssignedToId(open), open?.Window.Buzzer, allowedIds);
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
            ["canAnswer"] = CanAnswerOf(state, open, input.UserId),
            ["canBuzz"] = CanBuzz(open, input.UserId, input.Now),
            ["power"] = open?.Power,
            ["buzzer"] = open?.Window.Buzzer,
            ["buzzerMs"] = open?.Window.BuzzerMs,
            ["answerState"] = open is null ? "none" : StateOf(input.Submitted, open.Question.Id),
            ["mySubmission"] = MySubmissionOf(
                input.Submitted, open?.Question.Id, QuestionMatchOf(input, open?.Question.Id)),
            ["verdicts"] = VerdictsOf(input.Submitted)
        };

        var view = Base(input.MatchId, input.RoundId, input.Version,
            state.Ended ? "ended" : $"phase{state.Phase}", openList, RankTable(input.Table, input.TieBreak), me);
        view["board"] = board;
        if (audioGate is not null) view["audioGate"] = audioGate;
        if (mediaPolicy is not null) view["mediaPolicy"] = mediaPolicy;
        string? selectedPlayerId = SelectedPlayerOf(state, open, turnPlayerId);
        view["selectedPlayerId"] = selectedPlayerId;
        view["turnPlayerId"] = turnPlayerId;
        view["answererId"] = state.Open?.Answerer;
        view["assignedToId"] = AssignedToId(state.Open);
        view["stagedPower"] = StagedPowerOf(
            state.TurnIndex < state.Players.Count ? state.Players[state.TurnIndex] : null);
        view["console"] = new Dictionary<string, object?>
        {
            ["picksConfirmed"] = state.PicksConfirmed,
            ["turnQuestions"] = (state.TurnQuestions ?? []).Select(q => q.Id).ToList(),
            ["turnValues"] = (state.TurnQuestions ?? []).Select(q => q.Value).ToList(),
            ["powersLeft"] = state.TurnIndex < state.Players.Count
                ? state.Players[state.TurnIndex].Powers.Available
                : []
        };
        return view;
    }
}
