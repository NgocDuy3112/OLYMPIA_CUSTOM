import { useState, type SubmitEvent } from "react"
import { Button } from "@shared/ui/button"
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@shared/ui/dialog"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@shared/ui/field"
import { Input } from "@shared/ui/input"
import { useCreateSeason } from "@/lib/seasons"

interface StageDraft {
    id: string
    title: string
    start: string
    end: string
}

function emptyStage(): StageDraft {
    return { id: crypto.randomUUID(), title: "", start: "", end: "" }
}

function toIso(local: string): string {
    return new Date(local).toISOString()
}

// A new season, created in a dialog. The seasons page stays a table you can read.
export function NewSeasonDialog({
    tournamentId,
    open,
    onOpenChange,
}: {
    tournamentId: string
    open: boolean
    onOpenChange: (open: boolean) => void
}) {
    const create = useCreateSeason(tournamentId)

    const [name, setName] = useState("")
    const [current, setCurrent] = useState(false)
    const [stages, setStages] = useState<StageDraft[]>([])

    const updateStage = (id: string, patch: Partial<StageDraft>) =>
        setStages((rows) => rows.map((row) => (row.id === id ? { ...row, ...patch } : row)))

    const submit = (event: SubmitEvent<HTMLFormElement>) => {
        event.preventDefault()

        create.mutate(
            {
                name,
                current,
                stages: stages
                    .filter((stage) => stage.title && stage.start && stage.end)
                    .map((stage) => ({
                        id: stage.id,
                        title: stage.title,
                        start: toIso(stage.start),
                        end: toIso(stage.end),
                    })),
            },
            {
                onSuccess: () => {
                    setName("")
                    setCurrent(false)
                    setStages([])
                    onOpenChange(false)
                },
            }
        )
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-xl">
                <form onSubmit={submit}>
                    <FieldGroup>
                        <DialogHeader>
                            <DialogTitle>New season</DialogTitle>
                            <DialogDescription>
                                Rounds, format, and placement tiers are inherited from the tournament.
                            </DialogDescription>
                        </DialogHeader>

                        <Field>
                            <FieldLabel htmlFor="season-name">Name</FieldLabel>
                            <Input
                                id="season-name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="2026 Season"
                                required
                            />
                        </Field>

                        <Field>
                            <FieldLabel htmlFor="season-current">Make current</FieldLabel>
                            <input
                                id="season-current"
                                type="checkbox"
                                checked={current}
                                onChange={(e) => setCurrent(e.target.checked)}
                            />
                            <FieldDescription>
                                Only one season per tournament can be current.
                            </FieldDescription>
                        </Field>

                        <div className="flex flex-col gap-3">
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-medium">Stages</span>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setStages((rows) => [...rows, emptyStage()])}
                                >
                                    Add stage
                                </Button>
                            </div>

                            {stages.length === 0 && (
                                <FieldDescription>No stages yet.</FieldDescription>
                            )}

                            {stages.map((stage, index) => (
                                <div key={stage.id} className="flex flex-wrap items-end gap-2">
                                    <Input
                                        aria-label={`Stage ${index + 1} title`}
                                        className="max-w-48"
                                        placeholder="Group stage"
                                        value={stage.title}
                                        onChange={(e) => updateStage(stage.id, { title: e.target.value })}
                                    />
                                    <Input
                                        aria-label={`Stage ${index + 1} start`}
                                        type="datetime-local"
                                        value={stage.start}
                                        onChange={(e) => updateStage(stage.id, { start: e.target.value })}
                                    />
                                    <Input
                                        aria-label={`Stage ${index + 1} end`}
                                        type="datetime-local"
                                        value={stage.end}
                                        onChange={(e) => updateStage(stage.id, { end: e.target.value })}
                                    />
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() =>
                                            setStages((rows) => rows.filter((row) => row.id !== stage.id))
                                        }
                                    >
                                        Remove
                                    </Button>
                                </div>
                            ))}
                        </div>

                        {create.isError && (
                            <FieldError>
                                {create.error instanceof Error
                                    ? create.error.message
                                    : "Could not create the season."}
                            </FieldError>
                        )}

                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => onOpenChange(false)}
                                disabled={create.isPending}
                            >
                                Cancel
                            </Button>
                            <Button type="submit" disabled={create.isPending}>
                                {create.isPending ? "Creating…" : "Create season"}
                            </Button>
                        </DialogFooter>
                    </FieldGroup>
                </form>
            </DialogContent>
        </Dialog>
    )
}
