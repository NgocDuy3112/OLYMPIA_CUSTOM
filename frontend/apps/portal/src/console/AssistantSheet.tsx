import { pt } from "@shared/deck/geometry"
import { Button } from "@shared/ui/button"
import type { AssistantSurface } from "./model/use-console-assistant"

export function AssistantSheet({ surface }: { surface: AssistantSurface }) {
    const hasContent =
        surface.transcript.length > 0 ||
        surface.proposals.length > 0 ||
        surface.decisions.length > 0 ||
        surface.error !== null
    if (!hasContent) return null
    return (
        <aside
            className="absolute inset-y-[3cqw] right-[3cqw] z-30 flex w-[27cqw] flex-col gap-[1cqw] overflow-y-auto rounded-2xl bg-card p-[1.2cqw] shadow-md ring-1 ring-border"
            style={{ fontSize: pt(12) }}
        >
            {surface.error !== null && (
                <p role="alert" className="font-semibold text-destructive">
                    {surface.error}
                </p>
            )}
            {surface.transcript.map((entry) => (
                <p key={entry.turnId} className="whitespace-pre-wrap text-foreground">
                    {entry.text}
                </p>
            ))}
            {surface.proposals.map((proposal) => (
                <div key={proposal.proposalId} className="flex flex-col gap-[0.5cqw] rounded-xl border border-border p-[0.8cqw]">
                    <span className="font-mono text-muted-foreground">{proposal.action.kind}</span>
                    {proposal.rationale !== undefined && (
                        <span className="text-foreground">{proposal.rationale}</span>
                    )}
                    <div className="flex gap-[0.5cqw]">
                        <Button size="sm" onClick={() => surface.apply(proposal.proposalId)}>
                            Áp dụng
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => surface.dismiss(proposal.proposalId)}>
                            Bỏ qua
                        </Button>
                    </div>
                </div>
            ))}
            {surface.decisions.map((decision) => (
                <p key={decision.proposalId} className="text-muted-foreground">
                    {decision.outcome === "applied" ? "Đã áp dụng" : "Đã bỏ qua"} · {decision.action.kind}
                </p>
            ))}
        </aside>
    )
}
