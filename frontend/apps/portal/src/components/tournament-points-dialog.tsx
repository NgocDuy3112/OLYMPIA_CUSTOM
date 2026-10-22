import { useState } from "react"
import { Button } from "@shared/ui/button"
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@shared/ui/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@shared/ui/field"
import { useUpdateTournament, type TournamentDetail } from "@/lib/tournament"
import type { PlacementTier } from "@/lib/tournaments"
import { PlacementTiersEditor } from "@/components/placement-tiers-editor"


// The tournament's own points for places. The tournament hands a default down; a tournament may
// change it, and the tournament is what knows how many places it produces.
export function TournamentPointsDialog({
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

    const [tiers, setTiers] = useState<PlacementTier[]>(tournament.placementTiers ?? [])

    const save = () =>
        update.mutate(
            { placementTiers: tiers },
            { onSuccess: () => onOpenChange(false) }
        )

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <div className="flex flex-col gap-6">
                    <DialogHeader>
                        <DialogTitle>Points for places</DialogTitle>
                        <DialogDescription>
                            What each place of this tournament is worth. The tournament owns its scale.
                        </DialogDescription>
                    </DialogHeader>

                    <FieldGroup>
                        <Field>
                            <FieldLabel htmlFor="tournament-points">The scale</FieldLabel>
                            <PlacementTiersEditor tiers={tiers} onChange={setTiers} />
                            <FieldDescription>
                                A place with no band scores nothing. This tournament produces{" "}
                                {tournament.places ?? 0} places.
                            </FieldDescription>
                        </Field>
                    </FieldGroup>

                    {update.isError && (
                        <p role="alert" className="text-sm text-destructive">
                            {update.error.message}
                        </p>
                    )}

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            disabled={update.isPending}
                        >
                            Cancel
                        </Button>
                        <Button onClick={save} disabled={update.isPending}>
                            {update.isPending ? "Saving…" : "Save points"}
                        </Button>
                    </DialogFooter>
                </div>
            </DialogContent>
        </Dialog>
    )
}
