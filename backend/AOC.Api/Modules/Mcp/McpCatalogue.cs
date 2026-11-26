using System.Reflection;
using System.Text.Json;
using AOC.Api.Http;
using AOC.Api.Modules.Live;
using AOC.Api.Modules.Questions;
using AOC.Domain.Contracts;
using AOC.Infrastructure.Data;
using ModelContextProtocol.Server;

namespace AOC.Api.Modules.Mcp;

public static class McpCatalogue
{
    private static readonly IReadOnlyList<(string Kind, Type Type)> ActionKinds =
    [
        ("giai-ma.start", typeof(LiveAction.GiaiMaStart)),
        ("giai-ma.openHint", typeof(LiveAction.GiaiMaOpenHint)),
        ("giai-ma.lockHints", typeof(LiveAction.GiaiMaLockHints)),
        ("giai-ma.startKeywordWindow", typeof(LiveAction.GiaiMaStartKeywordWindow)),
        ("giai-ma.startWindow", typeof(LiveAction.GiaiMaStartWindow)),
        ("giai-ma.closeHintWindow", typeof(LiveAction.GiaiMaCloseHintWindow)),
        ("giai-ma.resolveHint", typeof(LiveAction.GiaiMaResolveHint)),
        ("giai-ma.submitKeyword", typeof(LiveAction.GiaiMaSubmitKeyword)),
        ("giai-ma.judgeKeyword", typeof(LiveAction.GiaiMaJudgeKeyword)),
        ("giai-ma.judgeKeywords", typeof(LiveAction.GiaiMaJudgeKeywords)),
        ("giai-ma.endRound", typeof(LiveAction.GiaiMaEndRound)),
        ("but-pha.start", typeof(LiveAction.ButPhaStart)),
        ("but-pha.openQuestion", typeof(LiveAction.ButPhaOpenQuestion)),
        ("but-pha.closeQuestion", typeof(LiveAction.ButPhaCloseQuestion)),
        ("but-pha.startClock", typeof(LiveAction.ButPhaStartClock)),
        ("but-pha.endRound", typeof(LiveAction.ButPhaEndRound)),
        ("but-pha.finalize", typeof(LiveAction.ButPhaFinalize)),
        ("khoi-dong.start", typeof(LiveAction.KhoiDongStart)),
        ("khoi-dong.recordOral", typeof(LiveAction.KhoiDongRecordOral)),
        ("khoi-dong.setTurn", typeof(LiveAction.KhoiDongSetTurn)),
        ("khoi-dong.startClock", typeof(LiveAction.KhoiDongStartClock)),
        ("khoi-dong.timeOutRun", typeof(LiveAction.KhoiDongTimeOutRun)),
        ("khoi-dong.beginPhase2", typeof(LiveAction.KhoiDongBeginPhase2)),
        ("khoi-dong.startWindow", typeof(LiveAction.KhoiDongStartWindow)),
        ("khoi-dong.judge", typeof(LiveAction.KhoiDongJudge)),
        ("khoi-dong.nextQuestion", typeof(LiveAction.KhoiDongNextQuestion)),
        ("khoi-dong.endRound", typeof(LiveAction.KhoiDongEndRound)),
        ("ve-dich.start", typeof(LiveAction.VeDichStart)),
        ("ve-dich.beginPhase2", typeof(LiveAction.VeDichBeginPhase2)),
        ("ve-dich.openQuestion", typeof(LiveAction.VeDichOpenQuestion)),
        ("ve-dich.reveal", typeof(LiveAction.VeDichReveal)),
        ("ve-dich.startClock", typeof(LiveAction.VeDichStartClock)),
        ("ve-dich.closeCurrentAnswer", typeof(LiveAction.VeDichCloseCurrentAnswer)),
        ("ve-dich.lockBuzz", typeof(LiveAction.VeDichLockBuzz)),
        ("ve-dich.resolve", typeof(LiveAction.VeDichResolve)),
        ("ve-dich.advanceTurn", typeof(LiveAction.VeDichAdvanceTurn)),
        ("ve-dich.setTurn", typeof(LiveAction.VeDichSetTurn)),
        ("ve-dich.endRound", typeof(LiveAction.VeDichEndRound)),
        ("ve-dich.pick", typeof(LiveAction.VeDichPick)),
        ("ve-dich.pickBatch", typeof(LiveAction.VeDichPickBatch)),
        ("ve-dich.pickRound", typeof(LiveAction.VeDichPickRound)),
        ("ve-dich.confirmPicks", typeof(LiveAction.VeDichConfirmPicks)),
        ("ve-dich.openPending", typeof(LiveAction.VeDichOpenPending)),
        ("ve-dich.switchQuestion", typeof(LiveAction.VeDichSwitchQuestion)),
        ("ve-dich.closeQuestion", typeof(LiveAction.VeDichCloseQuestion)),
        ("ve-dich.nextQuestion", typeof(LiveAction.VeDichNextQuestion)),
        ("ve-dich.clearPicks", typeof(LiveAction.VeDichClearPicks)),
        ("ve-dich.judge", typeof(LiveAction.VeDichJudge)),
        ("ve-dich.declarePower", typeof(LiveAction.VeDichDeclarePower)),
        ("ve-dich.buzz", typeof(LiveAction.VeDichBuzz)),
        ("round.goTo", typeof(LiveAction.RoundGoTo)),
        ("round.waiting", typeof(LiveAction.RoundWaiting)),
        ("reveal.answer", typeof(LiveAction.RevealAnswer)),
        ("score.adjust", typeof(LiveAction.ScoreAdjust)),
        ("answer.regrade", typeof(LiveAction.Regrade)),
    ];

    private static string FieldType(Type type)
    {
        if (type == typeof(string)) return "string";
        if (type == typeof(int)) return "integer";
        if (type == typeof(double)) return "number";
        if (type == typeof(bool)) return "boolean";
        if (type == typeof(int?)) return "integer?";
        if (type == typeof(bool?)) return "boolean?";
        if (type == typeof(List<string>)) return "string[]";
        if (type == typeof(List<(string PlayerId, bool Correct)>)) return "array of { playerId, correct }";
        if (type == typeof(List<(string PlayerId, string QuestionId, bool Correct)>))
            return "array of { playerId, questionId, correct }";
        var underlying = Nullable.GetUnderlyingType(type);
        if (underlying is { IsEnum: true }) return $"{underlying.Name}?";
        if (type.IsEnum) return type.Name;
        return type.Name;
    }

    private static object ActionKindOf(string kind, Type type)
    {
        var fields = type.GetConstructors()
            .OrderByDescending(ctor => ctor.GetParameters().Length)
            .First()
            .GetParameters()
            .Select(parameter => new
            {
                name = JsonNamingPolicy.CamelCase.ConvertName(parameter.Name!),
                type = FieldType(parameter.ParameterType)
            })
            .ToList();
        return new { kind, fields };
    }

    public static JsonElement Snapshot() => JsonDefaults.Serialize(new
    {
        scopes = McpToolCatalog.Scopes(),
        tools = McpToolCatalog.Tools.Select(tool => new
        {
            name = tool.Name,
            scope = tool.Scope.ToString(),
            readOnly = tool.ReadOnly,
            description = tool.Description
        }),
        liveActionKinds = ActionKinds.Select(entry => ActionKindOf(entry.Kind, entry.Type)),
        buckets = Buckets.AllBuckets.Select(bucket => new
        {
            bucket,
            kind = Buckets.BucketKind[bucket].ToString(),
            slot = SlotOf(bucket)
        }),
        conventions = new
        {
            conflict = "A stale expectedVersion/baseRevision returns { error: CONFLICT, currentVersion: n }. Re-read and retry with the version you just read.",
            dryRun = "Every mutating tool accepts dryRun: true — it validates and reports the change without writing.",
            versions = "live_action: live state version; assemble_match: match assemblyRevision; update_question: question updated-at in epoch milliseconds (from get_question); transition_match: current status as UPCOMING=0, LIVE=1, FINISHED=2."
        }
    });

    private static object? SlotOf(string bucket)
    {
        if (bucket == Buckets.TieBreakBucket) return null;
        var slot = Buckets.SlotForBucket(bucket);
        return new { roundId = slot.RoundId, turnId = slot.TurnId, points = slot.Points };
    }

    public static McpServerResource CreateResource() => McpServerResource.Create(
        () => JsonSerializer.Serialize(Snapshot(), JsonApi.Options),
        new McpServerResourceCreateOptions
        {
            UriTemplate = "aoc://catalogue",
            Name = "catalogue",
            Title = "AOC tool and live-action catalogue",
            Description = "Tool list with required scopes, every live_action kind with its fields, the question bucket rules, and the CAS conventions.",
            MimeType = "application/json"
        });
}
