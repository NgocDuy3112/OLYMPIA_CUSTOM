import { TABS, type Entry } from "./model"

export function MatchTabsBar({
    tabId,
    shown,
    onSelect,
}: {
    tabId: string
    shown: Record<string, Entry[]>
    onSelect: (tabId: string) => void
}) {
    return (
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Vòng thi">
            {TABS.map((candidate) => {
                const active = candidate.id === tabId
                const count = candidate.groups.reduce(
                    (sum, group) => sum + (shown[group.bucket]?.length ?? 0),
                    0
                )
                let tabCls = "bg-background hover:bg-muted"
                if (active) tabCls = "border-primary bg-primary text-primary-foreground"
                return (
                    <button
                        key={candidate.id}
                        type="button"
                        role="tab"
                        aria-pressed={active}
                        onClick={() => onSelect(candidate.id)}
                        className={
                            "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors " + tabCls
                        }
                    >
                        {candidate.label}
                        <span className="ml-1.5 text-xs font-normal opacity-70">{count}</span>
                    </button>
                )
            })}
        </div>
    )
}
