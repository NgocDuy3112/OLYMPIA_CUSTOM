import { useState } from "react"
import type { AssistantFrameRead } from "@shared/lib/ws"
import { isLiveActionKind, type LiveAction } from "@/lib/live-actions"

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

export interface AssistantDecision {
    proposalId: string
    action: LiveAction
    outcome: "applied" | "dismissed"
}

export interface AssistantSurface {
    transcript: AssistantTranscriptEntry[]
    proposals: AssistantProposal[]
    decisions: AssistantDecision[]
    error: string | null
    ingest: (read: AssistantFrameRead) => void
    apply: (proposalId: string) => void
    dismiss: (proposalId: string) => void
}

export function useConsoleAssistant(send: (action: LiveAction) => void): AssistantSurface {
    const [transcript, setTranscript] = useState<AssistantTranscriptEntry[]>([])
    const [proposals, setProposals] = useState<AssistantProposal[]>([])
    const [decisions, setDecisions] = useState<AssistantDecision[]>([])
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
            const kind = (toolCall.action as { kind: string }).kind
            if (!isLiveActionKind(kind)) {
                setError(`Đề xuất assistant có hành động không hợp lệ: ${kind}`)
                return
            }
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

    const decide = (proposalId: string, outcome: AssistantDecision["outcome"]) => {
        const proposal = proposals.find((item) => item.proposalId === proposalId)
        if (proposal === undefined) return
        if (outcome === "applied") send(proposal.action)
        setProposals((current) => current.filter((item) => item.proposalId !== proposalId))
        setDecisions((current) => [...current, { proposalId, action: proposal.action, outcome }])
    }

    return {
        transcript,
        proposals,
        decisions,
        error,
        ingest,
        apply: (proposalId) => decide(proposalId, "applied"),
        dismiss: (proposalId) => decide(proposalId, "dismissed"),
    }
}
