import { useId, type FormEvent, type ReactNode } from "react"
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
    const formId = useId()

    let body: ReactNode = (
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
        </>
    )
    let footer: ReactNode = (
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
                form={formId}
                disabled={enrollPending || enrollTournament === ""}
            >
                {enrollLabel}
            </Button>
        </DialogFooter>
    )
    if (options.length === 0) {
        body = (
            <p className="text-sm text-muted-foreground">
                Tài khoản này đã ghi danh vào tất cả giải.
            </p>
        )
        footer = null
    }
    if (tournamentsPending) {
        body = (
            <p className="text-sm text-muted-foreground">Đang tải danh sách giải…</p>
        )
        footer = null
    }

    return (
        <Dialog open onOpenChange={(next) => { if (!next) onClose() }}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Ghi danh {player.displayName}</DialogTitle>
                </DialogHeader>

                <form id={formId} onSubmit={onSubmit}>
                    <FieldGroup>{body}</FieldGroup>
                </form>

                {footer}
            </DialogContent>
        </Dialog>
    )
}
