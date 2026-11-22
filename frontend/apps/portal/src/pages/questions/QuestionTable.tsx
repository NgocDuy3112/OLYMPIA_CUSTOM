import { cn } from "cn"
import { Badge } from "@shared/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@shared/ui/table"
import { answerSummary, dateFormat, shapeOf } from "./model"
import type { BankQuestion, Status } from "./model"
import { PreviewText } from "./PreviewText"
import { SelectAllBox, SelectBox } from "./SelectBox"
import { RowActions } from "./RowActions"
import { StatusBadge } from "./StatusBadge"
import { QuestionUsageCell } from "./QuestionUsageCell"

export function QuestionTable({
    rows,
    showKind,
    selected,
    onToggleSelect,
    isAdmin,
    busy,
    flash,
    onEdit,
    onPreview,
    onTransition,
}: {
    rows: BankQuestion[]
    showKind: boolean
    selected: Map<string, BankQuestion>
    onToggleSelect: (row: BankQuestion) => void
    isAdmin: boolean
    busy: boolean
    flash: { id: string; message: string } | null
    onEdit: (row: BankQuestion) => void
    onPreview: (row: BankQuestion) => void
    onTransition: (row: BankQuestion, to: Status) => void
}) {
    return (
        <div className="rounded-xl border bg-card">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="w-8">
                            <SelectAllBox rows={rows} selected={selected} onToggle={onToggleSelect} />
                        </TableHead>
                        <TableHead>Question</TableHead>
                        {showKind && <TableHead className="w-20">Kind</TableHead>}
                        <TableHead className="w-28">Status</TableHead>
                        <TableHead className="w-40">Trận đã gán</TableHead>
                        <TableHead className="w-28">Updated</TableHead>
                        <TableHead className="w-72 text-right">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {rows.map((row) => {
                        const answer = answerSummary(row)
                        let answerCls = "text-muted-foreground"
                        if (answer) {
                            if (answer.includes("⚠")) answerCls = "text-destructive"
                        }
                        return (
                            <TableRow key={row.id}>
                                <TableCell>
                                    <SelectBox
                                        row={row}
                                        selected={selected}
                                        onToggle={onToggleSelect}
                                    />
                                </TableCell>
                                <TableCell className="max-w-md">
                                    <span className="block truncate font-medium" title={row.questionText}>
                                        <PreviewText row={row} onPreview={onPreview} className="font-medium" />
                                    </span>
                                    {answer && (
                                        <span
                                            title={answer}
                                            className={cn(
                                                "block truncate text-xs",
                                                answerCls
                                            )}
                                        >
                                            {answer}
                                        </span>
                                    )}
                                    {flash?.id === row.id && (
                                        <span role="alert" className="block text-xs text-destructive">{flash.message}</span>
                                    )}
                                </TableCell>
                                {showKind && (
                                    <TableCell><Badge variant="outline">{shapeOf(row)}</Badge></TableCell>
                                )}
                                <TableCell><StatusBadge status={row.status} /></TableCell>
                                <TableCell><QuestionUsageCell matches={row.assignedMatches} /></TableCell>
                                <TableCell className="text-sm text-muted-foreground">
                                    {dateFormat.format(new Date(row.updatedAt))}
                                </TableCell>
                                <TableCell>
                                    <RowActions
                                        row={row}
                                        isAdmin={isAdmin}
                                        busy={busy}
                                        onEdit={onEdit}
                                        onTransition={onTransition}
                                    />
                                </TableCell>
                            </TableRow>
                        )
                    })}
                </TableBody>
            </Table>
        </div>
    )
}
