using System.Text.Json;
using AOC.Domain.Contracts;
using AOC.Domain.Gameplay;
using AOC.Domain.Gameplay.Turns;
using AOC.Infrastructure.Data;

namespace AOC.Api.Modules.Live;

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
                    ["keywordWindowOpen"] = GiaiMaTurn.KeywordWindowRunning(state, now),
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
                    ["turnQuestions"] = (state.TurnQuestions ?? []).Select(q => q.Id).ToList(),
                    ["turnValues"] = (state.TurnQuestions ?? []).Select(q => q.Value).ToList(),
                    ["turnPicked"] = state.TurnPicked,
                    ["picksConfirmed"] = state.PicksConfirmed,
                    ["powersLeft"] = turnPlayer?.Powers.Available ?? [],
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
