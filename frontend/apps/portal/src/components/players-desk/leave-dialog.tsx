import type { FormEvent } from "react"
import { Button } from "@shared/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@shared/ui/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@shared/ui/field"
import type { PlayerRow } from "@/lib/players"

export function LeaveDialog({
    player,
    leaveTournament,
    leaveLabel,
    leavePending,
    leaveError,
    onTournamentChange,
    onClose,
    onSubmit,
}: {
    player: PlayerRow
    leaveTournament: string
    leaveLabel: string
    leavePending: boolean
    leaveError: string | null
    onTournamentChange: (value: string) => void
    onClose: () => void
    onSubmit: (event: FormEvent) => void
}) {
    return (
        <Dialog open onOpenChange={(next) => { if (!next) onClose() }}>
            <DialogContent>
                <form onSubmit={onSubmit}>
                    <FieldGroup>
                        <DialogHeader>
                            <DialogTitle>Bỏ {player.displayName} khỏi giải</DialogTitle>
                        </DialogHeader>

                        <Field>
                            <FieldLabel htmlFor="leave-tournament">Giải</FieldLabel>
                            <select
                                id="leave-tournament"
                                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
                                value={leaveTournament}
                                onChange={(event) => onTournamentChange(event.target.value)}
                            >
                                {player.enrollments.map((entry) => (
                                    <option key={entry.tournamentId} value={entry.tournamentId}>
                                        {entry.name}
                                    </option>
                                ))}
                            </select>
                            <FieldDescription>
                                Từ chối nếu thí sinh đã có kết quả ở giải này.
                            </FieldDescription>
                        </Field>

                        {leaveError !== null && (
                            <p role="alert" className="text-sm text-destructive">
                                {leaveError}
                            </p>
                        )}

                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={onClose}
                                disabled={leavePending}
                            >
                                Huỷ
                            </Button>
                            <Button
                                type="submit"
                                variant="destructive"
                                disabled={leavePending || leaveTournament === ""}
                            >
                                {leaveLabel}
                            </Button>
                        </DialogFooter>
                    </FieldGroup>
                </form>
            </DialogContent>
        </Dialog>
    )
}
