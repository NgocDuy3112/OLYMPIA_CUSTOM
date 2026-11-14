import type { CardData, ConsoleFacts } from "@/components/stage/deck"
import type { ConsoleCommits } from "../model/use-console-commits"
import type { ConsoleJudging } from "../model/use-console-judging"
import type { ConsoleNav } from "../model/use-console-nav"
import type { ConsolePlans } from "../model/use-console-plans"
import type { ConsoleTransport } from "../model/use-console-transport"
import type { ConsoleWatch } from "../model/use-console-watch"

interface ConsoleFactsParts {
    transport: ConsoleTransport
    baseCards: CardData[]
    stage: string
    judging: ConsoleJudging
    commits: ConsoleCommits
    plans: Pick<ConsolePlans, "hetLuot" | "backToLobby" | "pickQuestion">
    nav: Pick<ConsoleNav, "openRounds">
    watch: ConsoleWatch
    openAdjust: (userId: string) => void
}

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
        selectedIds: judging.selectedIds,
        commitHintReady: commits.commitHintReady,
        commitKeywordReady: commits.commitKeywordReady,
        commitHint: commits.commitHint,
        commitKeyword: commits.commitKeyword,
        setVerdict: judging.setVerdict,
        send: transport.send,
        sendChain: transport.sendChain,
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
