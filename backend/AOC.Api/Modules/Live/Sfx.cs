using System.Text.Json;
using AOC.Api.Realtime;
using AOC.Domain.Contracts;
using AOC.Infrastructure.Configuration;

namespace AOC.Api.Modules.Live;

/// <summary>
/// Which sound the room hears for a live action. One file per action, resolved
/// server-side (nobody can play a sound the desk didn't cause) and pushed to the
/// console + audience hubs as an `sfx` envelope — player devices stay silent.
/// Files live in the aoc bucket under sfx/ (public read, same as media/).
/// </summary>
public static class Sfx
{
    public const string Prefix = "sfx/";

    /// <summary>Public URL of a file in the bucket, or null when S3 isn't configured.</summary>
    public static string? UrlFor(string file)
    {
        var s3 = AppConfig.Instance.S3;
        if (!s3.Configured) return null;
        var baseUri = (s3.Endpoint ?? $"https://s3.{s3.Region}.amazonaws.com").TrimEnd('/');
        return $"{baseUri}/{s3.Bucket}/{Prefix}{file}";
    }

    /// <summary>The file for an action, given the state it produced and the round
    ///  it ran in — null means "the room hears nothing".</summary>
    public static string? FileFor(LiveAction action, JsonElement nextState, string roundId)
    {
        switch (action)
        {
            // ── khởi động ────────────────────────────────────────────────────
            case LiveAction.KhoiDongStart:
                return "kd_bat_dau.ogg";
            case LiveAction.KhoiDongNextQuestion:
                return "kd_mo_cau_hoi.mp3";
            // a fresh run = a fresh 40 s clock
            case LiveAction.KhoiDongSetTurn:
                return "kd_40s.mp3";
            // chung's typing window is 10 s
            case LiveAction.KhoiDongStartWindow:
                return "kd_10s.ogg";
            case LiveAction.KhoiDongJudge judge:
                return judge.Correct ? "kd_dung.mp3" : "kd_sai.mp3";
            case LiveAction.KhoiDongRecordOral oral:
                return oral.Correct ? "kd_dung.mp3" : "kd_sai.mp3";
            case LiveAction.KhoiDongEndRound:
                return "kd_ket_thuc.mp3";

            // ── giải mã ──────────────────────────────────────────────────────
            case LiveAction.GiaiMaStart:
                return "gm_bat_dau_2.mp3";
            // the pick reveals the hint…
            case LiveAction.GiaiMaOpenHint:
                return "gm_mo_cau_hoi.ogg";
            // …and Đếm giờ runs the 15 s clock
            case LiveAction.GiaiMaStartWindow:
                return "gm_15s.ogg";
            case LiveAction.GiaiMaResolveHint resolve:
                return resolve.Verdicts.Any(v => v.Correct) ? "gm_dung_goi_y.mp3" : null;
            case LiveAction.GiaiMaJudgeKeyword keyword:
                return keyword.Correct ? "gm_dung_tu_khoa.mp3" : null;

            // ── bứt phá ──────────────────────────────────────────────────────
            case LiveAction.ButPhaStart:
                return "bp_bat_dau.mp3";
            case LiveAction.ButPhaOpenQuestion:
                return "bp_mo_cau_hoi.ogg";
            case LiveAction.ButPhaStartClock:
                return "bp_30s.ogg";
            case LiveAction.ButPhaFinalize finalize:
                return finalize.Verdicts.Any(v => v.Correct) ? "bp_dung.mp3" : null;

            // ── về đích ──────────────────────────────────────────────────────
            case LiveAction.VeDichDeclarePower declare:
                return declare.PowerValue switch
                {
                    Power.STAR => "vd_ngoi_sao_hy_vong.mp3",
                    Power.ASSIGN => "vd_chi_dinh_doi_khang.mp3",
                    _ => null
                };
            case LiveAction.VeDichResolve resolveAnswer:
                return resolveAnswer.Answerer ? "vd_dung.ogg" : "vd_sai.ogg";
            case LiveAction.VeDichJudge judgeAnswer:
                return judgeAnswer.Correct ? "vd_dung.ogg" : "vd_sai.ogg";

            // ── the clocks: which second-count the room hears ────────────────
            case LiveAction.VeDichStartClock:
            case LiveAction.VeDichCloseCurrentAnswer:
            case LiveAction.VeDichReveal:
            case LiveAction.VeDichOpenQuestion:
            case LiveAction.VeDichPick:
            case LiveAction.VeDichNextQuestion:
                return roundId == "ve-dich" ? VeDichClockFile(action, nextState) : null;

            // ── shared ───────────────────────────────────────────────────────
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

    /// <summary>The value-keyed budget: a ve-dich clock sounds with its own
    ///  seconds (20→15, 30→20, 40→30, 50→45); the post-answer race is 5 s.</summary>
    private static string? VeDichClockFile(LiveAction action, JsonElement nextState)
    {
        var open = LiveState.ParseVeDich(nextState).Open;
        if (open is null) return null;

        var budget = open.Question.TimeLimit is int seconds ? $"vd_{seconds}s.mp3" : null;

        if (action is LiveAction.VeDichCloseCurrentAnswer) return "vd_5s.mp3";

        if (action is LiveAction.VeDichStartClock)
        {
            if (open.Stage != "buzz") return budget;
            // the assign race runs on the question's own clock, not the 5 s window
            return open.Power is not null ? budget : "vd_5s.mp3";
        }

        if (action is LiveAction.VeDichReveal)
        {
            // revealing an assigned question opens its race immediately
            return open.Stage == "buzz" && open.Power is not null && open.OpenedAt is null
                ? budget
                : null;
        }

        // pick / open / next: the clock may start with the question itself
        return open.OpenedAt is not null ? budget : null;
    }

    /// <summary>Push one sound to the console and the audience (never the players).</summary>
    public static async Task BroadcastAsync(MatchHubRegistry hub, string matchId, string file)
    {
        var url = UrlFor(file);
        if (url is null) return;
        await hub.BroadcastAsync(matchId, Protocol.Sfx(file, url), "console", "spectate");
    }
}
