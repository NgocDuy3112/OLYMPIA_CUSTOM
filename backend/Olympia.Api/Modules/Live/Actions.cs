using Olympia.Domain.Contracts;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Olympia.Api.Modules.Live;

/// <summary>Port of live/actions.ts — console/player live actions (discriminated by kind).</summary>
[JsonConverter(typeof(LiveActionConverter))]
public abstract record LiveAction
{
    public abstract string Kind { get; }

    // ---- giai-ma ----
    public sealed record GiaiMaStart(List<string> PlayerIds, List<string> HintIds) : LiveAction
    {
        public override string Kind => "giai-ma.start";
    }

    public sealed record GiaiMaOpenHint(string HintId) : LiveAction
    {
        public override string Kind => "giai-ma.openHint";
    }

    public sealed record GiaiMaCloseHintWindow : LiveAction
    {
        public override string Kind => "giai-ma.closeHintWindow";
    }

    public sealed record GiaiMaResolveHint(List<(string PlayerId, bool Correct)> Verdicts) : LiveAction
    {
        public override string Kind => "giai-ma.resolveHint";
    }

    public sealed record GiaiMaSubmitKeyword(string PlayerId, string QuestionId, string Text, VerdictSuggestion Suggestion) : LiveAction
    {
        public override string Kind => "giai-ma.submitKeyword";
    }

    public sealed record GiaiMaJudgeKeyword(string PlayerId, string QuestionId, bool Correct) : LiveAction
    {
        public override string Kind => "giai-ma.judgeKeyword";
    }

    public sealed record GiaiMaEndRound : LiveAction
    {
        public override string Kind => "giai-ma.endRound";
    }

    // ---- but-pha ----
    public sealed record ButPhaStart : LiveAction
    {
        public override string Kind => "but-pha.start";
    }

    public sealed record ButPhaOpenQuestion : LiveAction
    {
        public override string Kind => "but-pha.openQuestion";
    }

    public sealed record ButPhaCloseQuestion : LiveAction
    {
        public override string Kind => "but-pha.closeQuestion";
    }

    public sealed record ButPhaStartClock : LiveAction
    {
        public override string Kind => "but-pha.startClock";
    }

    public sealed record ButPhaEndRound : LiveAction
    {
        public override string Kind => "but-pha.endRound";
    }

    public sealed record ButPhaFinalize(string QuestionId, List<(string PlayerId, bool Correct)> Verdicts) : LiveAction
    {
        public override string Kind => "but-pha.finalize";
    }

    // ---- khoi-dong ----
    public sealed record KhoiDongStart(int? Phase) : LiveAction
    {
        public override string Kind => "khoi-dong.start";
    }

    public sealed record KhoiDongRecordOral(bool Correct, double SpentS) : LiveAction
    {
        public override string Kind => "khoi-dong.recordOral";
    }

    public sealed record KhoiDongTimeOutRun : LiveAction
    {
        public override string Kind => "khoi-dong.timeOutRun";
    }

    public sealed record KhoiDongBeginPhase2 : LiveAction
    {
        public override string Kind => "khoi-dong.beginPhase2";
    }

    public sealed record KhoiDongStartWindow : LiveAction
    {
        public override string Kind => "khoi-dong.startWindow";
    }

    public sealed record KhoiDongJudge(string PlayerId, bool Correct) : LiveAction
    {
        public override string Kind => "khoi-dong.judge";
    }

    public sealed record KhoiDongNextQuestion : LiveAction
    {
        public override string Kind => "khoi-dong.nextQuestion";
    }

    public sealed record KhoiDongEndRound : LiveAction
    {
        public override string Kind => "khoi-dong.endRound";
    }

    // ---- ve-dich ----
    public sealed record VeDichStart(int? Phase) : LiveAction
    {
        public override string Kind => "ve-dich.start";
    }

    public sealed record VeDichBeginPhase2 : LiveAction
    {
        public override string Kind => "ve-dich.beginPhase2";
    }

    public sealed record VeDichOpenQuestion(string QuestionId) : LiveAction
    {
        public override string Kind => "ve-dich.openQuestion";
    }

    public sealed record VeDichReveal : LiveAction
    {
        public override string Kind => "ve-dich.reveal";
    }

    public sealed record VeDichStartClock : LiveAction
    {
        public override string Kind => "ve-dich.startClock";
    }

    public sealed record VeDichCloseCurrentAnswer : LiveAction
    {
        public override string Kind => "ve-dich.closeCurrentAnswer";
    }

    public sealed record VeDichLockBuzz : LiveAction
    {
        public override string Kind => "ve-dich.lockBuzz";
    }

    public sealed record VeDichResolve(bool Answerer, bool? Buzzer) : LiveAction
    {
        public override string Kind => "ve-dich.resolve";
    }

    public sealed record VeDichAdvanceTurn : LiveAction
    {
        public override string Kind => "ve-dich.advanceTurn";
    }

    public sealed record VeDichEndRound : LiveAction
    {
        public override string Kind => "ve-dich.endRound";
    }

    public sealed record VeDichPick(string PlayerId, string QuestionId) : LiveAction
    {
        public override string Kind => "ve-dich.pick";
    }

    public sealed record VeDichPickBatch(string PlayerId, List<string> QuestionIds) : LiveAction
    {
        public override string Kind => "ve-dich.pickBatch";
    }

    public sealed record VeDichDeclarePower(string PlayerId, Power? PowerValue, string? TargetId) : LiveAction
    {
        public override string Kind => "ve-dich.declarePower";
    }

    public sealed record VeDichBuzz(string PlayerId) : LiveAction
    {
        public override string Kind => "ve-dich.buzz";
    }

    // ---- shared ----
    public sealed record RoundGoTo(string RoundId) : LiveAction
    {
        public override string Kind => "round.goTo";
    }

    public sealed record RevealAnswer(string QuestionId) : LiveAction
    {
        public override string Kind => "reveal.answer";
    }

    public sealed record ScoreAdjust(string UserId, int Delta, string Reason) : LiveAction
    {
        public override string Kind => "score.adjust";
    }
}

public enum VerdictSuggestion
{
    CORRECT,
    INCORRECT
}

public sealed class LiveActionConverter : JsonConverter<LiveAction>
{
    public override LiveAction? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        using var doc = JsonDocument.ParseValue(ref reader);
        var root = doc.RootElement;
        if (root.ValueKind != JsonValueKind.Object || !root.TryGetProperty("kind", out var kindEl))
            throw new JsonException("invalid live action");
        var kind = kindEl.GetString()!;

        string Str(string name)
        {
            if (root.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String)
            {
                return v.GetString()!;
            }
            throw new JsonException($"missing string '{name}'");
        }

        string? OptStr(string name)
        {
            if (root.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String)
            {
                return v.GetString();
            }
            return null;
        }

        bool Bool(string name) => root.TryGetProperty(name, out var v)
            && v.ValueKind is JsonValueKind.True or JsonValueKind.False && v.GetBoolean();

        int Int(string name)
        {
            if (root.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.Number)
            {
                return v.GetInt32();
            }
            throw new JsonException($"missing number '{name}'");
        }

        int? OptInt(string name)
        {
            if (root.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.Number)
            {
                return v.GetInt32();
            }
            return null;
        }

        double Num(string name)
        {
            if (root.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.Number)
            {
                return v.GetDouble();
            }
            throw new JsonException($"missing number '{name}'");
        }

        List<string> StrList(string name)
        {
            if (root.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.Array)
            {
                return v.EnumerateArray().Select(e => e.GetString() ?? "").ToList();
            }
            throw new JsonException($"missing array '{name}'");
        }

        List<(string PlayerId, bool Correct)> VerdictList(string name)
        {
            if (!root.TryGetProperty(name, out var v) || v.ValueKind != JsonValueKind.Array)
                throw new JsonException($"missing array '{name}'");
            return v.EnumerateArray().Select(e => (
                e.TryGetProperty("playerId", out var p) ? p.GetString() ?? "" : "",
                e.TryGetProperty("correct", out var c) && c.ValueKind == JsonValueKind.True
            )).ToList();
        }

        return kind switch
        {
            "giai-ma.start" => new LiveAction.GiaiMaStart(StrList("playerIds"), StrList("hintIds")),
            "giai-ma.openHint" => new LiveAction.GiaiMaOpenHint(Str("hintId")),
            "giai-ma.closeHintWindow" => new LiveAction.GiaiMaCloseHintWindow(),
            "giai-ma.resolveHint" => new LiveAction.GiaiMaResolveHint(VerdictList("verdicts")),
            "giai-ma.submitKeyword" => new LiveAction.GiaiMaSubmitKeyword(
                Str("playerId"), Str("questionId"), Str("text"),
                Enum.Parse<VerdictSuggestion>(Str("suggestion"))),
            "giai-ma.judgeKeyword" => new LiveAction.GiaiMaJudgeKeyword(
                Str("playerId"), Str("questionId"), Bool("correct")),
            "giai-ma.endRound" => new LiveAction.GiaiMaEndRound(),

            "but-pha.start" => new LiveAction.ButPhaStart(),
            "but-pha.openQuestion" => new LiveAction.ButPhaOpenQuestion(),
            "but-pha.closeQuestion" => new LiveAction.ButPhaCloseQuestion(),
            "but-pha.startClock" => new LiveAction.ButPhaStartClock(),
            "but-pha.endRound" => new LiveAction.ButPhaEndRound(),
            "but-pha.finalize" => new LiveAction.ButPhaFinalize(Str("questionId"), VerdictList("verdicts")),

            "khoi-dong.start" => new LiveAction.KhoiDongStart(OptInt("phase")),
            "khoi-dong.recordOral" => new LiveAction.KhoiDongRecordOral(Bool("correct"), Num("spentS")),
            "khoi-dong.timeOutRun" => new LiveAction.KhoiDongTimeOutRun(),
            "khoi-dong.beginPhase2" => new LiveAction.KhoiDongBeginPhase2(),
            "khoi-dong.startWindow" => new LiveAction.KhoiDongStartWindow(),
            "khoi-dong.judge" => new LiveAction.KhoiDongJudge(Str("playerId"), Bool("correct")),
            "khoi-dong.nextQuestion" => new LiveAction.KhoiDongNextQuestion(),
            "khoi-dong.endRound" => new LiveAction.KhoiDongEndRound(),

            "ve-dich.start" => new LiveAction.VeDichStart(OptInt("phase")),
            "ve-dich.beginPhase2" => new LiveAction.VeDichBeginPhase2(),
            "ve-dich.openQuestion" => new LiveAction.VeDichOpenQuestion(Str("questionId")),
            "ve-dich.reveal" => new LiveAction.VeDichReveal(),
            "ve-dich.startClock" => new LiveAction.VeDichStartClock(),
            "ve-dich.closeCurrentAnswer" => new LiveAction.VeDichCloseCurrentAnswer(),
            "ve-dich.lockBuzz" => new LiveAction.VeDichLockBuzz(),
            "ve-dich.resolve" => new LiveAction.VeDichResolve(
                Bool("answerer"),
                root.TryGetProperty("buzzer", out var b) && b.ValueKind is JsonValueKind.True or JsonValueKind.False
                    ? b.GetBoolean()
                    : null),
            "ve-dich.advanceTurn" => new LiveAction.VeDichAdvanceTurn(),
            "ve-dich.endRound" => new LiveAction.VeDichEndRound(),
            "ve-dich.pick" => new LiveAction.VeDichPick(Str("playerId"), Str("questionId")),
            "ve-dich.pickBatch" => new LiveAction.VeDichPickBatch(Str("playerId"), StrList("questionIds")),
            "ve-dich.declarePower" => new LiveAction.VeDichDeclarePower(
                Str("playerId"),
                root.TryGetProperty("power", out var pw) && pw.ValueKind == JsonValueKind.String
                    ? Enum.Parse<Power>(pw.GetString()!)
                    : null,
                OptStr("targetId")),
            "ve-dich.buzz" => new LiveAction.VeDichBuzz(Str("playerId")),

            "round.goTo" => new LiveAction.RoundGoTo(Str("roundId")),
            "reveal.answer" => new LiveAction.RevealAnswer(Str("questionId")),
            "score.adjust" => new LiveAction.ScoreAdjust(Str("userId"), Int("delta"), Str("reason")),

            _ => throw new JsonException($"unknown action kind \"{kind}\"")
        };
    }

    public override void Write(Utf8JsonWriter writer, LiveAction value, JsonSerializerOptions options)
        => throw new NotSupportedException("live actions are request-only");
}
