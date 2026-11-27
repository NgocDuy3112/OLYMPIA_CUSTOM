import { useId, type FormEvent } from "react"
import { Button } from "@shared/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@shared/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@shared/ui/field"
import { Input } from "@shared/ui/input"
import { discordValue } from "@/lib/discord"

export function EditPlayerDialog({
    editName,
    editEmail,
    editDiscord,
    saveLabel,
    updatePending,
    updateError,
    onNameChange,
    onEmailChange,
    onDiscordChange,
    onClose,
    onSubmit,
}: {
    editName: string
    editEmail: string
    editDiscord: string
    saveLabel: string
    updatePending: boolean
    updateError: string | null
    onNameChange: (value: string) => void
    onEmailChange: (value: string) => void
    onDiscordChange: (value: string) => void
    onClose: () => void
    onSubmit: (event: FormEvent) => void
}) {
    const formId = useId()
    return (
        <Dialog open onOpenChange={(next) => { if (!next) onClose() }}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Sửa thí sinh</DialogTitle>
                </DialogHeader>

                <form id={formId} onSubmit={onSubmit}>
                    <FieldGroup>

                        <Field>
                            <FieldLabel htmlFor="edit-player-name">Tên (trên bảng đấu)</FieldLabel>
                            <Input
                                id="edit-player-name"
                                value={editName}
                                onChange={(event) => onNameChange(event.target.value)}
                                maxLength={100}
                                aria-label="Edit player name"
                                autoFocus
                            />
                        </Field>

                        <Field>
                            <FieldLabel htmlFor="edit-player-email">Email</FieldLabel>
                            <Input
                                id="edit-player-email"
                                value={editEmail}
                                onChange={(event) => onEmailChange(event.target.value)}
                                type="email"
                                maxLength={255}
                                aria-label="Edit player email"
                                placeholder="bỏ trống = không có địa chỉ"
                            />
                        </Field>

                        <Field>
                            <FieldLabel htmlFor="edit-player-discord">
                                Discord ID (15–30 chữ số)
                            </FieldLabel>
                            <Input
                                id="edit-player-discord"
                                value={editDiscord}
                                onChange={(event) => onDiscordChange(event.target.value)}
                                maxLength={64}
                                inputMode="numeric"
                                aria-label="Discord ID"
                                placeholder="dán ID, mention hoặc link"
                            />
                            {editDiscord.trim() !== "" &&
                                !/^[0-9]{15,30}$/.test(discordValue(editDiscord)) && (
                                    <span className="text-xs text-destructive">
                                        ID Discord là dãy 15–30 chữ số
                                    </span>
                                )}
                        </Field>

                        {updateError !== null && (
                            <p role="alert" className="text-sm text-destructive">
                                {updateError}
                            </p>
                        )}
                    </FieldGroup>
                </form>

                <DialogFooter>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={onClose}
                        disabled={updatePending}
                    >
                        Huỷ
                    </Button>
                    <Button
                        type="submit"
                        form={formId}
                        disabled={
                            updatePending ||
                            editName.trim().length === 0 ||
                            (editDiscord.trim() !== "" &&
                                !/^[0-9]{15,30}$/.test(discordValue(editDiscord)))
                        }
                    >
                        {saveLabel}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
