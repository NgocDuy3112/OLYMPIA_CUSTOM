import { useState, type SubmitEvent } from "react"
import { Button } from "@shared/ui/button"
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@shared/ui/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@shared/ui/field"
import { Input } from "@shared/ui/input"
import { useCreateTournament } from "@/lib/tournaments"

// A new tournament: the unit. It owns its roster, its stages, its rulebook and its points.
export function NewTournamentDialog({
    open,
    onOpenChange,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
}) {
    const create = useCreateTournament()

    const [name, setName] = useState("")
    const [visibility, setVisibility] = useState<"PUBLIC" | "PRIVATE">("PUBLIC")

    const submit = (event: SubmitEvent<HTMLFormElement>) => {
        event.preventDefault()

        create.mutate(
            {
                name,
                visibility
            },
            {
                onSuccess: () => {
                    setName("")
                    onOpenChange(false)
                },
            }
        )
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <form onSubmit={submit}>
                    <FieldGroup>
                        <DialogHeader>
                            <DialogTitle>New tournament</DialogTitle>
                            <DialogDescription>
                                A tournament is one run: its roster, its stages, its matches and
                                its standings.
                            </DialogDescription>
                        </DialogHeader>

                        <Field>
                            <FieldLabel htmlFor="tournament-name">Name</FieldLabel>
                            <Input
                                id="tournament-name"
                                value={name}
                                onChange={(event) => setName(event.target.value)}
                                placeholder="2026 Tournament"
                                required
                            />
                        </Field>

                        <Field>
                            <FieldLabel htmlFor="tournament-visibility">Visibility</FieldLabel>
                            <select
                                id="tournament-visibility"
                                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
                                value={visibility}
                                onChange={(event) =>
                                    setVisibility(event.target.value as "PUBLIC" | "PRIVATE")
                                }
                            >
                                <option value="PUBLIC">Public</option>
                                <option value="PRIVATE">Private</option>
                            </select>
                            <FieldDescription>
                                A private tournament is visible to admins and its owner only.
                            </FieldDescription>
                        </Field>

                        {create.isError && (
                            <p className="text-sm text-destructive">{create.error.message}</p>
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
                                {create.isPending ? "Creating…" : "Create tournament"}
                            </Button>
                        </DialogFooter>
                    </FieldGroup>
                </form>
            </DialogContent>
        </Dialog>
    )
}
