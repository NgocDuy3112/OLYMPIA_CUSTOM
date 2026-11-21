import type { FormEvent, ReactNode } from "react"
import { Button } from "@shared/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@shared/ui/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@shared/ui/field"
import type { PlayerRow } from "@/lib/players"

interface TournamentOption {
    id: string
    name: string
    current?: boolean | null
}

export function EnrollDialog({
    player,
    options,
    enrollTournament,
    enrollLabel,
    enrollPending,
    enrollError,
    tournamentsPending,
    onTournamentChange,
    onClose,
    onSubmit,
}: {
    player: PlayerRow
    options: TournamentOption[]
    enrollTournament: string
    enrollLabel: string
    enrollPending: boolean
    enrollError: string | null
    tournamentsPending: boolean
    onTournamentChange: (value: string) => void
    onClose: () => void
    onSubmit: (event: FormEvent) => void
}) {
    let enrollSlot: ReactNode = (
        <>
            <Field>
                <FieldLabel htmlFor="enroll-tournament">Giải</FieldLabel>
                <select
                    id="enroll-tournament"
                    className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
                    value={enrollTournament}
                    onChange={(event) => onTournamentChange(event.target.value)}
                >
                    {options.map((tournament) => {
                        let currentTag = ""
                        if (tournament.current) currentTag = " · current"
                        return (
                            <option key={tournament.id} value={tournament.id}>
                                {tournament.name}
                                {currentTag}
                            </option>
                        )
                    })}
                </select>
                <FieldDescription>
                    Thí sinh vào bảng của giải này — thi được ngay khi có
                    trận.
                </FieldDescription>
            </Field>

            {enrollError !== null && (
                <p role="alert" className="text-sm text-destructive">
                    {enrollError}
                </p>
            )}

            <DialogFooter>
                <Button
                    type="button"
                    variant="outline"
                    onClick={onClose}
                    disabled={enrollPending}
                >
                    Huỷ
                </Button>
                <Button
                    type="submit"
                    disabled={enrollPending || enrollTournament === ""}
                >
                    {enrollLabel}
                </Button>
            </DialogFooter>
        </>
    )
    if (options.length === 0) {
        enrollSlot = (
            <p className="text-sm text-muted-foreground">
                Tài khoản này đã ghi danh vào tất cả giải.
            </p>
        )
    }
    if (tournamentsPending) {
        enrollSlot = (
            <p className="text-sm text-muted-foreground">Đang tải danh sách giải…</p>
        )
    }
    return (
        <Dialog open onOpenChange={(next) => { if (!next) onClose() }}>
            <DialogContent>
                <form onSubmit={onSubmit}>
                    <FieldGroup>
                        <DialogHeader>
                            <DialogTitle>Ghi danh {player.displayName}</DialogTitle>
                        </DialogHeader>
                        {enrollSlot}
                    </FieldGroup>
                </form>
            </DialogContent>
        </Dialog>
    )
}
