using System.Text.Json;
using AOC.Api.Modules.Live;
using AOC.Domain.Contracts;
using AOC.Domain.Engine.Turns;
using Xunit;

namespace AOC.Tests.Modules;

/// <summary>The room's soundtrack: which file an action asks for, and which
///  second-count a ve-dich clock announces. Pure map — the push itself is hub code.</summary>
public class SfxTests
{
    private static readonly JsonElement Empty = JsonSerializer.SerializeToElement(new { });

    private static OpenQuestion Open(int seconds, string stage = "current",
        Power? power = null, string? openedAt = "2026-01-01T00:00:00.000Z") => new()
    {
        Question = new VeDichQuestion { Id = "q1", Value = 30, TimeLimit = seconds },
        Answerer = "a",
        Stage = stage,
        Power = power,
        Revealed = true,
        OpenedAt = openedAt
    };

    private static JsonElement StateFor(OpenQuestion? open, string? buzzOpenedAt = null) =>
        JsonSerializer.SerializeToElement(new VeDichState
        {
            Open = open,
            BuzzOpenedAt = buzzOpenedAt
        })!;

    [Fact]
    public void KhoiDong_Lifecycle()
    {
        Assert.Equal("kd_bat_dau.ogg", Sfx.FileFor(new LiveAction.KhoiDongStart(1), Empty, "khoi-dong"));
        Assert.Equal("kd_mo_cau_hoi.mp3", Sfx.FileFor(new LiveAction.KhoiDongNextQuestion(), Empty, "khoi-dong"));
        Assert.Equal("kd_40s.mp3", Sfx.FileFor(new LiveAction.KhoiDongSetTurn("u1"), Empty, "khoi-dong"));
        Assert.Equal("kd_10s.ogg", Sfx.FileFor(new LiveAction.KhoiDongStartWindow(), Empty, "khoi-dong"));
        Assert.Equal("kd_ket_thuc.mp3", Sfx.FileFor(new LiveAction.KhoiDongEndRound(), Empty, "khoi-dong"));
    }

    [Fact]
    public void KhoiDong_Verdicts_SplitIntoDungSai()
    {
        Assert.Equal("kd_dung.mp3", Sfx.FileFor(new LiveAction.KhoiDongJudge("u1", true), Empty, "khoi-dong"));
        Assert.Equal("kd_sai.mp3", Sfx.FileFor(new LiveAction.KhoiDongJudge("u1", false), Empty, "khoi-dong"));
        Assert.Equal("kd_dung.mp3", Sfx.FileFor(new LiveAction.KhoiDongRecordOral(true, 3.2, "u1"), Empty, "khoi-dong"));
        Assert.Equal("kd_sai.mp3", Sfx.FileFor(new LiveAction.KhoiDongRecordOral(false, 3.2, null), Empty, "khoi-dong"));
    }

    [Fact]
    public void GiaiMa_PickAndDemGioAreTwoDifferentSounds()
    {
        Assert.Equal("gm_bat_dau_2.mp3", Sfx.FileFor(new LiveAction.GiaiMaStart([], []), Empty, "giai-ma"));
        Assert.Equal("gm_mo_cau_hoi.ogg", Sfx.FileFor(new LiveAction.GiaiMaOpenHint("q1"), Empty, "giai-ma"));
        Assert.Equal("gm_15s.ogg", Sfx.FileFor(new LiveAction.GiaiMaStartWindow(), Empty, "giai-ma"));
    }

    [Fact]
    public void GiaiMa_OnlyCorrectOutcomesSound()
    {
        Assert.Equal("gm_dung_goi_y.mp3", Sfx.FileFor(
            new LiveAction.GiaiMaResolveHint([("u1", true), ("u2", false)]), Empty, "giai-ma"));
        Assert.Null(Sfx.FileFor(
            new LiveAction.GiaiMaResolveHint([("u1", false), ("u2", false)]), Empty, "giai-ma"));

        Assert.Equal("gm_dung_tu_khoa.mp3", Sfx.FileFor(
            new LiveAction.GiaiMaJudgeKeyword("u1", "q9", true), Empty, "giai-ma"));
        Assert.Null(Sfx.FileFor(
            new LiveAction.GiaiMaJudgeKeyword("u1", "q9", false), Empty, "giai-ma"));
    }

    [Fact]
    public void ButPha_Lifecycle()
    {
        Assert.Equal("bp_bat_dau.mp3", Sfx.FileFor(new LiveAction.ButPhaStart(), Empty, "but-pha"));
        Assert.Equal("bp_mo_cau_hoi.ogg", Sfx.FileFor(new LiveAction.ButPhaOpenQuestion(), Empty, "but-pha"));
        Assert.Equal("bp_30s.ogg", Sfx.FileFor(new LiveAction.ButPhaStartClock(), Empty, "but-pha"));
        Assert.Equal("bp_dung.mp3", Sfx.FileFor(
            new LiveAction.ButPhaFinalize("q1", [("u1", false), ("u2", true)]), Empty, "but-pha"));
        Assert.Null(Sfx.FileFor(
            new LiveAction.ButPhaFinalize("q1", [("u1", false)]), Empty, "but-pha"));
    }

    [Fact]
    public void VeDich_Powers_AreTheirOwnFanfares()
    {
        Assert.Equal("vd_ngoi_sao_hy_vong.mp3", Sfx.FileFor(
            new LiveAction.VeDichDeclarePower("u1", Power.STAR, null), Empty, "ve-dich"));
        Assert.Equal("vd_chi_dinh_doi_khang.mp3", Sfx.FileFor(
            new LiveAction.VeDichDeclarePower("u1", Power.ASSIGN, "u2"), Empty, "ve-dich"));
        Assert.Null(Sfx.FileFor(
            new LiveAction.VeDichDeclarePower("u1", null, null), Empty, "ve-dich"));
    }

    [Fact]
    public void VeDich_Verdicts_SplitIntoDungSai()
    {
        Assert.Equal("vd_dung.ogg", Sfx.FileFor(new LiveAction.VeDichResolve(true, null), Empty, "ve-dich"));
        Assert.Equal("vd_sai.ogg", Sfx.FileFor(new LiveAction.VeDichResolve(false, true), Empty, "ve-dich"));
        Assert.Equal("vd_dung.ogg", Sfx.FileFor(new LiveAction.VeDichJudge("u1", true), Empty, "ve-dich"));
        Assert.Equal("vd_sai.ogg", Sfx.FileFor(new LiveAction.VeDichJudge("u1", false), Empty, "ve-dich"));
    }

    [Fact]
    public void VeDich_ClockAnnouncesItsOwnSeconds()
    {
        // Tính giờ on a 20 s cell
        Assert.Equal("vd_20s.mp3", Sfx.FileFor(
            new LiveAction.VeDichStartClock(), StateFor(Open(20)), "ve-dich"));
        Assert.Equal("vd_45s.mp3", Sfx.FileFor(
            new LiveAction.VeDichPick("u1", "q1"), StateFor(Open(45)), "ve-dich"));

        // …but no clock means no sound: the question merely opened
        Assert.Null(Sfx.FileFor(
            new LiveAction.VeDichOpenQuestion("q1"), StateFor(Open(20, openedAt: null)), "ve-dich"));
    }

    [Fact]
    public void VeDich_ThePostAnswerRaceIsFiveSeconds()
    {
        Assert.Equal("vd_5s.mp3", Sfx.FileFor(
            new LiveAction.VeDichCloseCurrentAnswer(), StateFor(Open(30, stage: "buzz")), "ve-dich"));
        Assert.Equal("vd_5s.mp3", Sfx.FileFor(
            new LiveAction.VeDichStartClock(), StateFor(Open(30, stage: "buzz")), "ve-dich"));
    }

    [Fact]
    public void VeDich_AnAssignedRaceRunsOnTheQuestionClock()
    {
        Assert.Equal("vd_30s.mp3", Sfx.FileFor(
            new LiveAction.VeDichStartClock(),
            StateFor(Open(30, stage: "buzz", power: Power.ASSIGN)), "ve-dich"));
        Assert.Equal("vd_30s.mp3", Sfx.FileFor(
            new LiveAction.VeDichReveal(),
            StateFor(Open(30, stage: "buzz", power: Power.ASSIGN, openedAt: null),
                buzzOpenedAt: "2026-01-01T00:00:00.000Z"), "ve-dich"));
    }

    [Fact]
    public void RevealAnswer_TakesTheFaceOfItsRound()
    {
        Assert.Equal("kd_hien_tra_loi.ogg", Sfx.FileFor(new LiveAction.RevealAnswer("q1"), Empty, "khoi-dong"));
        Assert.Equal("gm_hien_tra_loi.ogg", Sfx.FileFor(new LiveAction.RevealAnswer("q1"), Empty, "giai-ma"));
        Assert.Equal("bp_hien_tra_loi.ogg", Sfx.FileFor(new LiveAction.RevealAnswer("q1"), Empty, "but-pha"));
        Assert.Equal("vd_hien_tra_loi.mp3", Sfx.FileFor(new LiveAction.RevealAnswer("q1"), Empty, "ve-dich"));
    }

    [Fact]
    public void NavigationAndScoreChanges_AreSilent()
    {
        Assert.Null(Sfx.FileFor(new LiveAction.RoundGoTo("giai-ma"), Empty, "giai-ma"));
        Assert.Null(Sfx.FileFor(new LiveAction.ScoreAdjust("u1", 10, "bonus"), Empty, "giai-ma"));
        Assert.Null(Sfx.FileFor(new LiveAction.GiaiMaCloseHintWindow(), Empty, "giai-ma"));
    }
}
