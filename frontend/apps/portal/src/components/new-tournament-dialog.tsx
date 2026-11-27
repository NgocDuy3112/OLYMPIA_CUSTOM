import { useId, useState, type SubmitEvent } from "react"
import { Button } from "@shared/ui/button"
import {
    Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@shared/ui/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@shared/ui/field"
import { Input } from "@shared/ui/input"
import { useCreateTournament } from "@/lib/tournaments"

export function NewTournamentDialog({
    open,
    onOpenChange,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
}) {
    const create = useCreateTournament()
    const formId = useId()

    const [name, setName] = useState("")
    const [visibility, setVisibility] = useState<"PUBLIC" | "PRIVATE">("PUBLIC")

    const submit = (event: SubmitEvent<HTMLFormElement>) => {
        event.preventDefault()
        if (create.isPending) return

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

    let createLabel = "Create tournament"
    if (create.isPending) createLabel = "Creating…"

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>New tournament</DialogTitle>
                </DialogHeader>

                <form id={formId} onSubmit={submit}>
                    <FieldGroup>
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
                            <p role="alert" className="text-sm text-destructive">
                                {create.error.message}
                            </p>
                        )}
                    </FieldGroup>
                </form>

                <DialogFooter>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        disabled={create.isPending}
                    >
                        Cancel
                    </Button>
                    <Button type="submit" form={formId} disabled={create.isPending}>
                        {createLabel}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
