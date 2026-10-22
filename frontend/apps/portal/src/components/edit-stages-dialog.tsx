import { useState } from "react"
import { Button } from "@shared/ui/button"
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@shared/ui/dialog"
import { Input } from "@shared/ui/input"
import { useUpdateTournament, type TournamentDetail } from "@/lib/tournament"
import { STAGE_ROLES, type Stage, type StageRole } from "@/lib/tournaments"

interface StageDraft {
    id: string
    title: string
    role: StageRole | ""
    start: string
    end: string
}

// The id a stage gets from its title: what the staff type when they place a match.
function slugify(title: string): string {
    return title
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
}

function toDraft(stage: Stage): StageDraft {
    return {
        id: stage.id,
        title: stage.title,
        role: stage.role ?? "",
        start: stage.start ? stage.start.slice(0, 10) : "",
        end: stage.end ? stage.end.slice(0, 10) : "",
    }
}

// The tournament's stages, edited in a dialog. The order of the list is the order of the
// tournament, so the rows can be moved.
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
            current.map((stage, i) => (i === index ? { ...stage, ...change } : stage)))

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
            .map((stage) => ({
                id: stage.id.trim(),
                title: stage.title.trim(),
                role: stage.role || undefined,
                start: stage.start ? new Date(stage.start).toISOString() : undefined,
                end: stage.end ? new Date(stage.end).toISOString() : undefined
            }))
        update.mutate({ stages }, { onSuccess: () => onOpenChange(false) })
    }

    const invalid = draft.some((stage) => stage.title.trim() && !stage.id.trim())
    const duplicate = draft.some(
        (stage, index) =>
            stage.id.trim() && draft.findIndex((other) => other.id.trim() === stage.id.trim()) !== index
    )

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl">
                <div className="flex flex-col gap-6">
                    <DialogHeader>
                        <DialogTitle>Stages</DialogTitle>
                        <DialogDescription>
                            The order of the tournament. The last stage a player reached is what
                            places them; the id is what a match names. A stage's rule is what the
                            engine checks its matches against.
                        </DialogDescription>
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
                                            patch(index, {
                                                title,
                                                // The id follows the title until the staff type one.
                                                id:
                                                    stage.id === slugify(stage.title) || !stage.id
                                                        ? slugify(title)
                                                        : stage.id,
                                            })
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
                            {update.isPending ? "Saving…" : "Save stages"}
                        </Button>
                    </DialogFooter>
                </div>
            </DialogContent>
        </Dialog>
    )
}
