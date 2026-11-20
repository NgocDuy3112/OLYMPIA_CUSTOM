using System.Text.Json;
using AOC.Api.Realtime;
using AOC.Domain.Contracts;
using AOC.Domain.Gameplay;
using AOC.Domain.Gameplay.Turns;
using AOC.Infrastructure.Media;

namespace AOC.Api.Modules.Live;

public static class Sfx
{
    public const string Prefix = "sfx/";

    public static string? UrlFor(string file) =>
        MediaStorage.Presign($"{Prefix}{file}", TimeSpan.FromMinutes(10));

    public static string? FileFor(LiveAction action, JsonElement nextState, string roundId)
    {
        switch (action)
        {
            case LiveAction.KhoiDongStart:
                return "kd_bat_dau.ogg";
            case LiveAction.KhoiDongNextQuestion:
                return "kd_mo_cau_hoi.mp3";
            case LiveAction.KhoiDongStartClock:
                return "kd_40s.mp3";
            case LiveAction.KhoiDongStartWindow:
                return "kd_10s.ogg";
            case LiveAction.KhoiDongJudge judge:
                return judge.Correct ? "kd_dung.mp3" : "kd_sai.mp3";
            case LiveAction.KhoiDongRecordOral oral:
                return oral.Correct ? "kd_dung.mp3" : "kd_sai.mp3";
            case LiveAction.KhoiDongEndRound:
                return "kd_ket_thuc.mp3";
            case LiveAction.KhoiDongTimeOutRun:
                return "kd_ket_thuc.mp3";

            case LiveAction.GiaiMaStart:
                return "gm_bat_dau_2.mp3";
            case LiveAction.GiaiMaOpenHint:
                return "gm_mo_cau_hoi.ogg";
            case LiveAction.GiaiMaStartWindow:
            case LiveAction.GiaiMaStartKeywordWindow:
                return "gm_15s.ogg";
            case LiveAction.GiaiMaResolveHint resolve:
                return resolve.Verdicts.Any(v => v.Correct) ? "gm_dung_goi_y.mp3" : null;
            case LiveAction.GiaiMaJudgeKeyword keyword:
                return keyword.Correct ? "gm_dung_tu_khoa.mp3" : null;

            case LiveAction.ButPhaStart:
                return "bp_bat_dau.mp3";
            case LiveAction.ButPhaOpenQuestion:
                return "bp_mo_cau_hoi.ogg";
            case LiveAction.ButPhaStartClock:
                return "bp_30s.ogg";
            case LiveAction.ButPhaFinalize finalize:
                return finalize.Verdicts.Any(v => v.Correct) ? "bp_dung.mp3" : null;

            case LiveAction.VeDichBuzz:
                return "vd_buzz.mp3";
            case LiveAction.VeDichDeclarePower declare:
                return declare.PowerValue switch
                {
                    PowerKind.STAR => "vd_ngoi_sao_hy_vong.mp3",
                    PowerKind.ASSIGN => "vd_chi_dinh_doi_khang.mp3",
                    _ => null
                };
            case LiveAction.VeDichResolve resolveAnswer:
                return resolveAnswer.Answerer ? "vd_dung.ogg" : "vd_sai.ogg";
            case LiveAction.VeDichJudge judgeAnswer:
                return judgeAnswer.Correct ? "vd_dung.ogg" : "vd_sai.ogg";

            case LiveAction.VeDichStartClock:
            case LiveAction.VeDichCloseCurrentAnswer:
            case LiveAction.VeDichReveal:
            case LiveAction.VeDichOpenQuestion:
            case LiveAction.VeDichPick:
            case LiveAction.VeDichNextQuestion:
                return roundId == "ve-dich" ? VeDichClockFile(action, nextState) : null;

            case LiveAction.RevealAnswer:
                return roundId switch
                {
                    "khoi-dong" => "kd_hien_tra_loi.ogg",
                    "giai-ma" => "gm_hien_tra_loi.ogg",
                    "but-pha" => "bp_hien_tra_loi.ogg",
                    "ve-dich" => "vd_hien_tra_loi.mp3",
                    _ => null
                };

            default:
                return null;
        }
    }

    private static string? VeDichClockFile(LiveAction action, JsonElement nextState)
    {
        var state = LiveState.ParseVeDich(nextState);
        var open = state.Open;
        if (open is null) return null;

        var seconds = ClockSecondsOf(state, open);
        var budget = seconds is null ? null : $"vd_{seconds.Value}s.mp3";

        if (action is LiveAction.VeDichCloseCurrentAnswer) return "vd_5s.mp3";

        if (action is LiveAction.VeDichStartClock)
        {
            if (open.Step != "buzz") return budget;
            return open.Power is not null ? budget : "vd_5s.mp3";
        }

        if (action is LiveAction.VeDichReveal)
        {
            return open.Step == "buzz" && open.Power is not null && open.OpenedAt is null
                ? budget
                : null;
        }

        return open.OpenedAt is not null ? budget : null;
    }

    private static int? ClockSecondsOf(VeDichState state, OpenQuestion open)
    {
        if (open.Step == "buzz") return VeDichTurn.BuzzWindowSeconds(state);
        return RoundRules.VeDichClockSeconds(state.Rules, open.Question.Value);
    }

    public static async Task BroadcastAsync(MatchHubRegistry hub, string matchId, string? file)
    {
        if (file is null) return;
        var url = UrlFor(file);
        if (url is null) return;
        await hub.BroadcastAsync(matchId, Protocol.Sfx(file, url), "console", "spectate");
    }

    public static async Task BroadcastStopAsync(MatchHubRegistry hub, string matchId)
    {
        await hub.BroadcastAsync(matchId, Protocol.SfxStop(), "console", "spectate");
    }
}
