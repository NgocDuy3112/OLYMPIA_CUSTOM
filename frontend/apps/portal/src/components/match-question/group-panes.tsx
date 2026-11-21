import { ComposeGroup } from "@/components/compose-group"
import type { RoundConfig } from "@/lib/tournament"
import { requiredFor, toComposeRows, type Entry, type TabDef } from "./model"

export function GroupPanes({
    tab,
    shown,
    unplaced,
    editable,
    rules,
    playerCount,
    onRemove,
}: {
    tab: TabDef
    shown: Record<string, Entry[]>
    unplaced: Entry[]
    editable: boolean
    rules: Record<string, RoundConfig> | null | undefined
    playerCount: number
    onRemove: (bucket: string, rowId: string) => void
}) {
    return (
        <div className="grid gap-4">
            {tab.groups.map((group) => {
                const entries = shown[group.bucket] ?? []
                const required = requiredFor(group, rules, playerCount)
                let filled = entries.length
                if (group.bucket === "giai-ma") filled = entries.filter((entry) => entry.kind === "TEXT").length
                let typeLabel: string | undefined = undefined
                if (group.typeLabel) typeLabel = group.typeLabel
                let emptyHint = "Chưa có câu hỏi trong nhóm này"
                if (editable) emptyHint = "Kéo câu từ ngân hàng bên phải, hoặc bấm vào một câu để thêm"
                return (
                    <ComposeGroup
                        key={group.bucket}
                        groupId={group.bucket}
                        label={group.label}
                        typeLabel={typeLabel}
                        filled={filled}
                        required={required}
                        rows={toComposeRows(entries)}
                        editable={editable}
                        onRemove={(rowId) => onRemove(group.bucket, rowId)}
                        emptyHint={emptyHint}
                    />
                )
            })}

            {unplaced.length > 0 && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs">
                    <span className="font-semibold text-amber-700 dark:text-amber-400">
                        {unplaced.length} câu không khớp vòng nào của bộ AOC
                    </span>
                    <ul className="mt-1 list-inside list-disc text-muted-foreground">
                        {unplaced.map((entry, index) => (
                            <li key={`${entry.sourceId}~${index}`}>
                                {entry.questionText || entry.sourceId}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    )
}
