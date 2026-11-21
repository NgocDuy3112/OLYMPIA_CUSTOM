import { UNASSIGNED, belongsToTab, bucketOf } from "./model"
import type { BankQuestion, Status, TabDef } from "./model"
import { GroupSection } from "./GroupSection"

export function GroupList({
    tab,
    rows,
    counts,
    selected,
    onToggleSelect,
    isAdmin,
    busy,
    flash,
    onEdit,
    onPreview,
    onTransition,
    onAdd,
    onAddHint,
}: {
    tab: TabDef
    rows: BankQuestion[]
    counts?: Record<string, number>
    selected: Map<string, BankQuestion>
    onToggleSelect: (row: BankQuestion) => void
    isAdmin: boolean
    busy: boolean
    flash: { id: string; message: string } | null
    onEdit: (row: BankQuestion) => void
    onPreview: (row: BankQuestion) => void
    onTransition: (row: BankQuestion, to: Status) => void
    onAdd: (bucket: string) => void
    onAddHint: (keywordId: string, openDialog?: boolean) => void
}) {
    const assigned = rows.filter((row) => belongsToTab(bucketOf(row), tab.id))
    const unassigned = rows.filter((row) => bucketOf(row) === null)
    const shared = {
        rows,
        selected,
        onToggleSelect,
        isAdmin,
        busy,
        flash,
        onEdit,
        onPreview,
        onTransition,
        onAdd,
        onAddHint,
    }

    return (
        <div className="grid gap-6">
            {tab.groups.map((group) => {
                let groupCount: number | undefined = undefined
                if (group.bucket) groupCount = counts?.[group.bucket]
                return (
                    <GroupSection
                        key={group.bucket}
                        group={group}
                        count={groupCount}
                        {...shared}
                        rows={assigned.filter((row) => bucketOf(row) === group.bucket)}
                    />
                )
            })}
            {unassigned.length > 0 && (
                <GroupSection group={UNASSIGNED} {...shared} rows={unassigned} />
            )}
        </div>
    )
}
