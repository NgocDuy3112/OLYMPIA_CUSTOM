using System.Text.Json;
using System.Text.Json.Serialization;
using AOC.Domain.Contracts;

namespace AOC.Api.Modules.Live;

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
            "giai-ma.lockHints" => new LiveAction.GiaiMaLockHints(),
            "giai-ma.startKeywordWindow" => new LiveAction.GiaiMaStartKeywordWindow(),
            "giai-ma.startWindow" => new LiveAction.GiaiMaStartWindow(),
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
            "khoi-dong.recordOral" => new LiveAction.KhoiDongRecordOral(Bool("correct"), Num("spentS"), OptStr("playerId")),
            "khoi-dong.setTurn" => new LiveAction.KhoiDongSetTurn(Str("playerId")),
            "khoi-dong.startClock" => new LiveAction.KhoiDongStartClock(),
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
            "ve-dich.setTurn" => new LiveAction.VeDichSetTurn(Str("playerId")),
            "ve-dich.endRound" => new LiveAction.VeDichEndRound(),
            "ve-dich.pick" => new LiveAction.VeDichPick(Str("playerId"), Str("questionId")),
            "ve-dich.pickBatch" => new LiveAction.VeDichPickBatch(Str("playerId"), StrList("questionIds")),
            "ve-dich.pickRound" => new LiveAction.VeDichPickRound(StrList("questionIds")),
            "ve-dich.confirmPicks" => new LiveAction.VeDichConfirmPicks(),
            "ve-dich.openPending" => new LiveAction.VeDichOpenPending(Str("questionId")),
            "ve-dich.switchQuestion" => new LiveAction.VeDichSwitchQuestion(Str("questionId")),
            "ve-dich.closeQuestion" => new LiveAction.VeDichCloseQuestion(),
            "ve-dich.nextQuestion" => new LiveAction.VeDichNextQuestion(),
            "ve-dich.clearPicks" => new LiveAction.VeDichClearPicks(),
            "ve-dich.judge" => new LiveAction.VeDichJudge(Str("playerId"), Bool("correct")),
            "ve-dich.declarePower" => new LiveAction.VeDichDeclarePower(
                Str("playerId"),
                root.TryGetProperty("power", out var pw) && pw.ValueKind == JsonValueKind.String
                    ? Enum.Parse<PowerKind>(pw.GetString()!)
                    : null,
                OptStr("targetId")),
            "ve-dich.buzz" => new LiveAction.VeDichBuzz(Str("playerId")),

            "round.goTo" => new LiveAction.RoundGoTo(Str("roundId")),
            "round.waiting" => new LiveAction.RoundWaiting(),
            "reveal.answer" => new LiveAction.RevealAnswer(Str("questionId")),
            "score.adjust" => new LiveAction.ScoreAdjust(Str("userId"), Int("delta"), Str("reason")),
            "answer.regrade" => new LiveAction.Regrade(Str("questionId"), Str("playerId"), Int("delta")),

            _ => throw new JsonException($"unknown action kind \"{kind}\"")
        };
    }

    public override void Write(Utf8JsonWriter writer, LiveAction value, JsonSerializerOptions options)
        => throw new NotSupportedException("live actions are request-only");
}
