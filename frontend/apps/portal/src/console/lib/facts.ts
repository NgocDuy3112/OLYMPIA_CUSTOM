// Assembling `ConsoleFacts` — the one place the deck's contract is filled in.
//
// The facts bag is what a round module draws from, so this file is the seam
// between "the model knows it" and "the screen may see it". Keeping the
// assembly here means the model file reads as: gate, cards, facts, return — and
// means a field added to ConsoleFacts shows up in exactly one diff.
import type { CardData, ConsoleFacts } from "@/components/stage/deck"
import type { ConsoleCommits } from "../model/use-console-commits"
import type { ConsoleJudging } from "../model/use-console-judging"
import type { ConsoleNav } from "../model/use-console-nav"
import type { ConsolePlans } from "../model/use-console-plans"
import type { ConsoleTransport } from "../model/use-console-transport"
import type { ConsoleWatch } from "../model/use-console-watch"

export interface ConsoleFactsParts {
    transport: ConsoleTransport
    /** the round screen's cards (console/lib/rail-cards) */
    baseCards: CardData[]
    stage: string
    judging: ConsoleJudging
    commits: ConsoleCommits
    plans: Pick<ConsolePlans, "hetLuot" | "backToLobby" | "pickQuestion">
    nav: Pick<ConsoleNav, "openRounds">
    watch: ConsoleWatch
    /** open the score-adjust dialog for one seated player */
    openAdjust: (userId: string) => void
}

/** The deck's facts: transport's snapshot + the round's plans + the console's state. */
export function consoleFactsOf(parts: ConsoleFactsParts): ConsoleFacts {
    const { transport, judging, commits, plans, nav, watch } = parts
    return {
        v: transport.v!,
        stage: parts.stage,
        remaining: transport.remaining,
        rows: judging.rows,
        baseCards: parts.baseCards,
        judgingId: judging.judgingId,
        target: judging.target,
        setSelectedQ: judging.setSelectedQ,
        setSelectedPlayer: judging.setSelectedPlayer,
        toggleSelect: judging.toggleSelect,
        commitHintReady: commits.commitHintReady,
        commitKeywordReady: commits.commitKeywordReady,
        commitHint: commits.commitHint,
        commitKeyword: commits.commitKeyword,
        setVerdict: judging.setVerdict,
        send: transport.send,
        hetLuot: plans.hetLuot,
        backToLobby: plans.backToLobby,
        pickQuestion: plans.pickQuestion,
        byId: transport.byId,
        verdictOf: judging.verdictOf,
        watchRunning: watch.running,
        watchMs: watch.ms,
        toggleWatch: watch.toggle,
        flash: transport.flash,
        openRounds: nav.openRounds,
        openAdjust: parts.openAdjust,
    }
}
