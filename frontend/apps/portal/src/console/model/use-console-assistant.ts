import { useState } from "react"
import type { AssistantFrameRead } from "@shared/lib/ws"
import type { LiveAction } from "@/lib/live-actions"

export interface AssistantProposal {
    proposalId: string
    action: LiveAction
    rationale?: string
}

export interface AssistantTranscriptEntry {
    turnId: string
    text: string
    done: boolean
}

export interface AssistantSurface {
    transcript: AssistantTranscriptEntry[]
    proposals: AssistantProposal[]
    error: string | null
    ingest: (read: AssistantFrameRead) => void
}

export function useConsoleAssistant(): AssistantSurface {
    const [transcript, setTranscript] = useState<AssistantTranscriptEntry[]>([])
    const [proposals, setProposals] = useState<AssistantProposal[]>([])
    const [error, setError] = useState<string | null>(null)

    const ingest = (read: AssistantFrameRead) => {
        if (!read.ok) {
            setError(read.error)
            return
        }
        setError(null)
        const { turnId, delta, done, toolCall } = read.frame
        if (delta !== undefined) {
            setTranscript((current) => {
                const index = current.findIndex((entry) => entry.turnId === turnId)
                if (index === -1) return [...current, { turnId, text: delta, done: false }]
                const next = current.slice()
                next[index] = { ...next[index], text: next[index].text + delta }
                return next
            })
        }
        if (done === true) {
            setTranscript((current) =>
                current.map((entry) => (entry.turnId === turnId ? { ...entry, done: true } : entry))
            )
        }
        if (toolCall !== undefined) {
            setProposals((current) => {
                if (current.some((proposal) => proposal.proposalId === toolCall.proposalId)) return current
                const proposal: AssistantProposal = {
                    proposalId: toolCall.proposalId,
                    action: toolCall.action as LiveAction,
                }
                if (toolCall.rationale !== undefined) proposal.rationale = toolCall.rationale
                return [...current, proposal]
            })
        }
    }

    return { transcript, proposals, error, ingest }
}
