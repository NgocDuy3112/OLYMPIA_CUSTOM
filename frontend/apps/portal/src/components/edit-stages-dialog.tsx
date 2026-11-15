import { useState } from "react"
import { Button } from "@shared/ui/button"
import {
    Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@shared/ui/dialog"
import { Input } from "@shared/ui/input"
import { useUpdateTournament, type TournamentDetail } from "@/lib/tournament"
import { slugify } from "@/lib/slug"
import { STAGE_ROLES, type Stage, type StageRole } from "@/lib/tournaments"

interface StageDraft {
    id: string
    title: string
    role: StageRole | ""
    start: string
    end: string
}


function toDraft(stage: Stage): StageDraft {
    let start = ""
    if (stage.start) start = stage.start.slice(0, 10)
    let end = ""
    if (stage.end) end = stage.end.slice(0, 10)
    return {
        id: stage.id,
        title: stage.title,
        role: stage.role ?? "",
        start,
        end,
    }
}

export function EditStagesDialog({
    tournamentId,
    tournament,
    open,
    onOpenChange,
}: {
    tournamentId: string
    tournament: TournamentDetail
    open: boolean
    onOpenChange: (open: boolean) => void
}) {
    const update = useUpdateTournament(tournamentId)

    const [draft, setDraft] = useState<StageDraft[]>(() =>
        (tournament.stages ?? []).map(toDraft))

    const patch = (index: number, change: Partial<StageDraft>) =>
        setDraft((current) =>
            current.map((stage, i) => {
                if (i === index) return { ...stage, ...change }
                return stage
            }))

    const move = (index: number, by: number) =>
        setDraft((current) => {
            const next = [...current]
            const target = index + by
            if (target < 0 || target >= next.length) return current
            const [row] = next.splice(index, 1)
            next.splice(target, 0, row)
            return next
        })

    const add = () =>
        setDraft((current) => [...current, { id: "", title: "", role: "", start: "", end: "" }])

    const remove = (index: number) =>
        setDraft((current) => current.filter((_, i) => i !== index))

    const save = () => {
        const stages = draft
            .filter((stage) => stage.title.trim() && stage.id.trim())
            .map((stage) => {
                let start: string | undefined = undefined
                if (stage.start) start = new Date(stage.start).toISOString()
                let end: string | undefined = undefined
                if (stage.end) end = new Date(stage.end).toISOString()
                return {
                    id: stage.id.trim(),
                    title: stage.title.trim(),
                    role: stage.role || undefined,
                    start,
                    end,
                }
            })
        update.mutate({ stages }, { onSuccess: () => onOpenChange(false) })
    }

    const invalid = draft.some((stage) => stage.title.trim() && !stage.id.trim())
    const duplicate = draft.some(
        (stage, index) =>
            stage.id.trim() && draft.findIndex((other) => other.id.trim() === stage.id.trim()) !== index
    )
    let saveLabel = "Save stages"
    if (update.isPending) saveLabel = "Saving…"

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl">
                <div className="flex flex-col gap-6">
                    <DialogHeader>
                        <DialogTitle>Stages</DialogTitle>
                    </DialogHeader>

                    <div className="flex max-h-[50vh] flex-col gap-3 overflow-y-auto">
                        {draft.length === 0 && (
                            <p className="text-sm text-muted-foreground">No stages yet.</p>
                        )}

                        {draft.map((stage, index) => (
                            <div key={index} className="flex flex-wrap items-end gap-2">
                                <span className="w-6 pb-2 text-sm tabular-nums text-muted-foreground">
                                    {index + 1}
                                </span>

                                <label className="flex flex-col gap-1">
                                    <span className="text-xs text-muted-foreground">Title</span>
                                    <Input
                                        className="h-8 w-40"
                                        value={stage.title}
                                        placeholder="Playoff"
                                        onChange={(event) => {
                                            const title = event.target.value
                                            let nextId = stage.id
                                            if (stage.id === slugify(stage.title)) nextId = slugify(title)
                                            if (!stage.id) nextId = slugify(title)
                                            patch(index, { title, id: nextId })
                                        }}
                                    />
                                </label>

                                <label className="flex flex-col gap-1">
                                    <span className="text-xs text-muted-foreground">Id</span>
                                    <Input
                                        className="h-8 w-32 font-mono text-xs"
                                        value={stage.id}
                                        placeholder="playoff"
                                        onChange={(event) => patch(index, { id: event.target.value })}
                                    />
                                </label>

                                <label className="flex flex-col gap-1">
                                    <span className="text-xs text-muted-foreground">Rule</span>
                                    <select
                                        className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
                                        value={stage.role}
                                        onChange={(event) =>
                                            patch(index, { role: event.target.value as StageRole | "" })
                                        }
                                    >
                                        <option value="">none — not checked</option>
                                        {STAGE_ROLES.map((role) => (
                                            <option key={role.value} value={role.value}>
                                                {role.label}
                                            </option>
                                        ))}
                                    </select>
                                </label>

                                <label className="flex flex-col gap-1">
                                    <span className="text-xs text-muted-foreground">Start</span>
                                    <Input
                                        type="date"
                                        className="h-8 w-36"
                                        value={stage.start}
                                        onChange={(event) => patch(index, { start: event.target.value })}
                                    />
                                </label>

                                <div className="flex gap-1 pb-0.5">
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="ghost"
                                        aria-label="Move up"
                                        disabled={index === 0}
                                        onClick={() => move(index, -1)}
                                    >
                                        ↑
                                    </Button>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="ghost"
                                        aria-label="Move down"
                                        disabled={index === draft.length - 1}
                                        onClick={() => move(index, 1)}
                                    >
                                        ↓
                                    </Button>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => remove(index)}
                                    >
                                        Remove
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div>
                        <Button size="sm" variant="outline" onClick={add}>
                            Add stage
                        </Button>
                    </div>

                    {invalid && (
                        <p className="text-sm text-destructive">Every stage needs an id.</p>
                    )}
                    {duplicate && (
                        <p className="text-sm text-destructive">Two stages share the same id.</p>
                    )}
                    {update.isError && (
                        <p role="alert" className="text-sm text-destructive">{update.error.message}</p>
                    )}

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            disabled={update.isPending}
                        >
                            Cancel
                        </Button>
                        <Button onClick={save} disabled={invalid || duplicate || update.isPending}>
                            {saveLabel}
                        </Button>
                    </DialogFooter>
                </div>
            </DialogContent>
        </Dialog>
    )
}
