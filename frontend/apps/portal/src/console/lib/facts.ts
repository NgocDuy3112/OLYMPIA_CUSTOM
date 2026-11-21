import type { CardData, ConsoleFacts } from "@/components/stage/deck"
import type { ConsoleCommits } from "@/console/model/use-console-commits"
import type { ConsoleJudging } from "@/console/model/use-console-judging"
import type { ConsolePlans } from "@/console/model/use-console-plans"
import type { ConsoleTransport } from "@/console/model/use-console-transport"

interface ConsoleFactsParts {
    transport: ConsoleTransport
    baseCards: CardData[]
    stage: string
    judging: ConsoleJudging
    commits: ConsoleCommits
    plans: Pick<ConsolePlans, "hetLuot" | "backToLobby" | "pickQuestion">
    openAdjust: (userId: string) => void
    openRegrade: (userId: string) => void
}

export function consoleFactsOf(parts: ConsoleFactsParts): ConsoleFacts {
    const { transport, judging, commits, plans } = parts
    return {
        v: transport.v!,
        stage: parts.stage,
        remaining: transport.remaining,
        keywordRemaining: transport.keywordRemaining,
        oralRemaining: transport.oralRemaining,
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
        flash: transport.flash,
        openAdjust: parts.openAdjust,
        openRegrade: parts.openRegrade,
    }
}
