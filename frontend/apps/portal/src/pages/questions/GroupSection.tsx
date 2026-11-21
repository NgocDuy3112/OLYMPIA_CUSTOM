import { Plus } from "lucide-react"
import { Button } from "@shared/ui/button"
import type { BankQuestion, GroupDef, Status } from "./model"
import { McCard } from "./McCard"
import { KeywordSetCard } from "./KeywordSetCard"
import { QuestionTable } from "./QuestionTable"

export function GroupSection({
    group,
    rows,
    count,
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
    group: GroupDef
    rows: BankQuestion[]
    count?: number
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
    const keywords = rows.filter((row) => row.kind === "KEYWORD")
    const choices = rows.filter((row) => row.kind === "CHOICE")
    const keywordIds = new Set(keywords.map((row) => row.id))
    const plain = rows.filter(
        (row) =>
            row.kind !== "KEYWORD" &&
            row.kind !== "CHOICE" &&
            !(row.kind === "TEXT" && row.keywordId != null && keywordIds.has(row.keywordId))
    )

    return (
        <section className="grid gap-3" aria-label={`Nhóm ${group.label}`}>
            <header className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-4 py-2.5">
                <span className="text-sm font-semibold">{group.label}</span>
                <span className="text-xs text-muted-foreground">{count ?? rows.length} câu</span>
                {group.bucket && (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="ml-auto"
                        aria-label="Thêm"
                        title="Thêm"
                        onClick={() => onAdd(group.bucket as string)}
                    >
                        <Plus className="size-4" aria-hidden />
                    </Button>
                )}
            </header>

            {rows.length === 0 && (
                <p className="rounded-lg border border-dashed px-4 py-3 text-xs text-muted-foreground">
                    Chưa có câu hỏi trong nhóm này.
                </p>
            )}

            {plain.length > 0 && (
                <QuestionTable
                    rows={plain}
                    showKind
                    selected={selected}
                    onToggleSelect={onToggleSelect}
                    isAdmin={isAdmin}
                    busy={busy}
                    flash={flash}
                    onEdit={onEdit}
                    onPreview={onPreview}
                    onTransition={onTransition}
                />
            )}

            {choices.length > 0 && (
                <div className="grid gap-3">
                    {choices.map((row) => (
                        <McCard
                            key={row.id}
                            row={row}
                            selected={selected}
                            onToggleSelect={onToggleSelect}
                            isAdmin={isAdmin}
                            busy={busy}
                            flash={flash}
                            onEdit={onEdit}
                            onPreview={onPreview}
                            onTransition={onTransition}
                        />
                    ))}
                </div>
            )}

            {keywords.length > 0 && (
                <div className="grid gap-4">
                    {keywords.map((row) => (
                        <KeywordSetCard
                            key={row.id}
                            row={row}
                            selected={selected}
                            onToggleSelect={onToggleSelect}
                            isAdmin={isAdmin}
                            busy={busy}
                            flash={flash}
                            onEdit={onEdit}
                            onPreview={onPreview}
                            onTransition={onTransition}
                            onAddHint={onAddHint}
                        />
                    ))}
                </div>
            )}
        </section>
    )
}
