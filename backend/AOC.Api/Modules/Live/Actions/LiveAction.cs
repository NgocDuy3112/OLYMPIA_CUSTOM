using AOC.Domain.Contracts;
using System.Text.Json.Serialization;

namespace AOC.Api.Modules.Live;

[JsonConverter(typeof(LiveActionConverter))]
public abstract record LiveAction
{
    public abstract string Kind { get; }

    public (string Action, object Details)? Describe(string roundId) => this switch
    {
        KhoiDongJudge judge => ("answer_judged", new JudgeDetails(roundId, judge.PlayerId, judge.Correct)),
        VeDichJudge judge => ("answer_judged", new JudgeDetails(roundId, judge.PlayerId, judge.Correct)),
        VeDichResolve resolve => ("ve_dich_resolved",
            new ResolveDetails(roundId, resolve.Answerer, resolve.Buzzer)),
        RevealAnswer reveal => ("answer_revealed", new RevealDetails(roundId, reveal.QuestionId)),
        ScoreAdjust adjust => ("score_adjusted",
            new ScoreAdjustDetails(adjust.UserId, adjust.Delta, adjust.Reason)),
        Regrade regrade => ("answer_regraded",
            new RegradeDetails(roundId, regrade.QuestionId, regrade.PlayerId, regrade.Delta)),
        _ => null
    };

    public sealed record JudgeDetails(string RoundId, string PlayerId, bool Correct);

    public sealed record ResolveDetails(string RoundId, bool Answerer, bool? Buzzer);

    public sealed record RevealDetails(string RoundId, string QuestionId);

    public sealed record ScoreAdjustDetails(string UserId, int Delta, string Reason);

    public sealed record RegradeDetails(string RoundId, string QuestionId, string PlayerId, int Delta);

    public sealed record GiaiMaStart(List<string> PlayerIds, List<string> HintIds) : LiveAction
    {
        public override string Kind => "giai-ma.start";
    }

    public sealed record GiaiMaOpenHint(string HintId) : LiveAction
    {
        public override string Kind => "giai-ma.openHint";
    }

    public sealed record GiaiMaStartKeywordWindow : LiveAction
    {
        public override string Kind => "giai-ma.startKeywordWindow";
    }

    public sealed record GiaiMaLockHints : LiveAction
    {
        public override string Kind => "giai-ma.lockHints";
    }

    public sealed record GiaiMaStartWindow : LiveAction
    {
        public override string Kind => "giai-ma.startWindow";
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

    public sealed record GiaiMaJudgeKeywords(List<(string PlayerId, string QuestionId, bool Correct)> Verdicts)
        : LiveAction
    {
        public override string Kind => "giai-ma.judgeKeywords";
    }

    public sealed record GiaiMaEndRound : LiveAction
    {
        public override string Kind => "giai-ma.endRound";
    }

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

    public sealed record KhoiDongStart(int? Phase) : LiveAction
    {
        public override string Kind => "khoi-dong.start";
    }

    public sealed record KhoiDongRecordOral(bool Correct, double SpentS, string? PlayerId) : LiveAction
    {
        public override string Kind => "khoi-dong.recordOral";
    }

    public sealed record KhoiDongSetTurn(string PlayerId) : LiveAction
    {
        public override string Kind => "khoi-dong.setTurn";
    }

    public sealed record KhoiDongStartClock : LiveAction
    {
        public override string Kind => "khoi-dong.startClock";
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

    public sealed record VeDichSetTurn(string PlayerId) : LiveAction
    {
        public override string Kind => "ve-dich.setTurn";
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

    public sealed record VeDichPickRound(List<string> QuestionIds) : LiveAction
    {
        public override string Kind => "ve-dich.pickRound";
    }

    public sealed record VeDichConfirmPicks : LiveAction
    {
        public override string Kind => "ve-dich.confirmPicks";
    }

    public sealed record VeDichOpenPending(string QuestionId) : LiveAction
    {
        public override string Kind => "ve-dich.openPending";
    }

    public sealed record VeDichSwitchQuestion(string QuestionId) : LiveAction
    {
        public override string Kind => "ve-dich.switchQuestion";
    }

    public sealed record VeDichCloseQuestion : LiveAction
    {
        public override string Kind => "ve-dich.closeQuestion";
    }

    public sealed record VeDichNextQuestion : LiveAction
    {
        public override string Kind => "ve-dich.nextQuestion";
    }

    public sealed record VeDichClearPicks : LiveAction
    {
        public override string Kind => "ve-dich.clearPicks";
    }

    public sealed record VeDichJudge(string PlayerId, bool Correct) : LiveAction
    {
        public override string Kind => "ve-dich.judge";
    }

    public sealed record VeDichDeclarePower(string PlayerId, PowerKind? PowerValue, string? TargetId) : LiveAction
    {
        public override string Kind => "ve-dich.declarePower";
    }

    public sealed record VeDichBuzz(string PlayerId) : LiveAction
    {
        public override string Kind => "ve-dich.buzz";
    }

    public sealed record RoundGoTo(string RoundId) : LiveAction
    {
        public override string Kind => "round.goTo";
    }

    public sealed record RoundWaiting() : LiveAction
    {
        public override string Kind => "round.waiting";
    }

    public sealed record RevealAnswer(string QuestionId) : LiveAction
    {
        public override string Kind => "reveal.answer";
    }

    public sealed record Regrade(string QuestionId, string PlayerId, int Delta) : LiveAction
    {
        public override string Kind => "answer.regrade";
    }

    public sealed record ScoreAdjust(string UserId, int Delta, string Reason) : LiveAction
    {
        public override string Kind => "score.adjust";
    }
}
