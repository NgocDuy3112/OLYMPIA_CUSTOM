import { Badge } from "@shared/ui/badge"
import { Button } from "@shared/ui/button"
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
                return (
                    <Button
                        key={candidate.id}
                        type="button"
                        role="tab"
                        aria-pressed={active}
                        variant={active ? "default" : "outline"}
                        size="sm"
                        onClick={() => onSelect(candidate.id)}
                    >
                        {candidate.label}
                        <Badge variant={active ? "secondary" : "outline"} className="tabular-nums">
                            {count}
                        </Badge>
                    </Button>
                )
            })}
        </div>
    )
}
