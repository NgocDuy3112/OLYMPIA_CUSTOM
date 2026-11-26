import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Copy, UserPlus } from "lucide-react"
import { api } from "@shared/lib/api"
import { errorMessage } from "@shared/lib/error-text"
import { Badge } from "@shared/ui/badge"
import { Button } from "@shared/ui/button"
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@shared/ui/dialog"
import { Input } from "@shared/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@shared/ui/table"
import { EmptyState, ErrorPanel, ListSkeleton, Page, PageHeader } from "@/components/page"



interface Operator {
    id: string
    username: string
    displayName: string
    role: "ADMIN" | "OPERATOR"
    disabledAt: string | null
    createdAt: string
}

const USERNAME_PATTERN = /^[a-zA-Z0-9._-]{3,50}$/
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" })

function InviteOperatorDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
    const queryClient = useQueryClient()
    const [username, setUsername] = useState("")
    const [displayName, setDisplayName] = useState("")
    const [inviteToken, setInviteToken] = useState<string | null>(null)
    const [copied, setCopied] = useState(false)
    const [password, setPassword] = useState("")
    const [confirmPassword, setConfirmPassword] = useState("")
    const [accepted, setAccepted] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const reset = () => {
        setUsername("")
        setDisplayName("")
        setInviteToken(null)
        setCopied(false)
        setPassword("")
        setConfirmPassword("")
        setAccepted(false)
        setError(null)
    }

    const create = useMutation({
        mutationFn: () => {
            const patch: { displayName?: string } = {}
            if (displayName.trim()) patch.displayName = displayName.trim()
            return api<{ inviteToken: string }>("/portal/operators", {
                method: "POST",
                body: JSON.stringify({
                    username: username.trim(),
                    ...patch,
                }),
            })
        },
        onSuccess: (result) => {
            setInviteToken(result.inviteToken)
            void queryClient.invalidateQueries({ queryKey: ["operators"] })
        },
        onError: (cause) => setError(errorMessage(cause)),
    })

    const accept = useMutation({
        mutationFn: (input: { token: string; password: string }) =>
            api<{ ok: true }>("/portal/invites/accept", {
                method: "POST",
                body: JSON.stringify(input),
            }),
        onSuccess: () => {
            setAccepted(true)
            void queryClient.invalidateQueries({ queryKey: ["operators"] })
        },
    })

    const usernameOk = USERNAME_PATTERN.test(username.trim())
    let reason: string | null = null
    if (!usernameOk) reason = "3–50 chars: letters, digits, dot, dash, underscore"
    if (!username.trim()) reason = "A username is required"

    let copyLabel = "Copy"
    if (copied) copyLabel = "Copied"
    let createLabel = "Create operator"
    if (create.isPending) createLabel = "Creating…"
    let acceptReason: string | null = null
    if (password.length < 12) acceptReason = "At least 12 characters"
    else if (confirmPassword !== password) acceptReason = "Passwords do not match"

    if (inviteToken) {
        return (
            <Dialog
                open={open}
                onOpenChange={(next) => {
                    if (!next) {
                        reset()
                        onClose()
                    }
                }}
            >
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Invite created — shown once</DialogTitle>
                    </DialogHeader>
                        <div className="grid gap-2">
                            <div className="flex items-center gap-2 rounded-lg border bg-muted/50 p-3">
                                <code className="min-w-0 flex-1 break-all font-mono text-xs">{inviteToken}</code>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                        void navigator.clipboard.writeText(inviteToken)
                                        setCopied(true)
                                    }}
                                >
                                    <Copy className="size-3.5" aria-hidden />
                                    {copyLabel}
                                </Button>
                            </div>
                            {accepted ? (
                                <p role="status" className="text-sm text-muted-foreground">
                                    Invite accepted — {username} can now sign in with this password.
                                </p>
                            ) : (
                                <form
                                    className="grid gap-2"
                                    onSubmit={(event) => {
                                        event.preventDefault()
                                        accept.mutate({ token: inviteToken, password })
                                    }}
                                >
                                    <label className="text-sm font-medium" htmlFor="invite-password">Password</label>
                                    <Input
                                        id="invite-password"
                                        type="password"
                                        autoComplete="new-password"
                                        value={password}
                                        onChange={(event) => setPassword(event.target.value)}
                                    />
                                    <label className="text-sm font-medium" htmlFor="invite-confirm">Confirm password</label>
                                    <Input
                                        id="invite-confirm"
                                        type="password"
                                        autoComplete="new-password"
                                        value={confirmPassword}
                                        onChange={(event) => setConfirmPassword(event.target.value)}
                                    />
                                    {acceptReason !== null && (
                                        <p className="text-xs text-muted-foreground">{acceptReason}</p>
                                    )}
                                    {accept.isError && <ErrorPanel message={errorMessage(accept.error)} />}
                                    <Button
                                        type="submit"
                                        disabled={acceptReason !== null || accept.isPending}
                                    >
                                        Accept invite
                                    </Button>
                                </form>
                            )}
                        </div>
                        <DialogFooter>
                            <Button
                                onClick={() => {
                                    reset()
                                    onClose()
                                }}
                            >
                                Done
                            </Button>
                        </DialogFooter>
                </DialogContent>
            </Dialog>
        )
    }

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                if (!next) {
                    reset()
                    onClose()
                }
            }}
        >
            <DialogContent className="sm:max-w-lg">
                    <>
                        <DialogHeader>
                            <DialogTitle>New operator</DialogTitle>
                        </DialogHeader>

                        <div className="grid gap-4">
                            <div className="grid gap-2">
                                <label className="text-sm font-medium" htmlFor="op-username">Username</label>
                                <Input
                                    id="op-username"
                                    value={username}
                                    onChange={(event) => setUsername(event.target.value)}
                                    placeholder="ngoc.duy"
                                    maxLength={50}
                                />
                            </div>
                            <div className="grid gap-2">
                                <label className="text-sm font-medium" htmlFor="op-name">Display name (optional)</label>
                                <Input
                                    id="op-name"
                                    value={displayName}
                                    onChange={(event) => setDisplayName(event.target.value)}
                                    placeholder="Ngọc Duy"
                                    maxLength={100}
                                />
                            </div>
                            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
                        </div>

                        <DialogFooter className="items-center gap-2">
                            <span className="mr-auto text-xs text-muted-foreground">{reason}</span>
                            <Button variant="outline" onClick={() => { reset(); onClose() }}>Cancel</Button>
                            <Button disabled={reason !== null || create.isPending} onClick={() => create.mutate()}>
                                {createLabel}
                            </Button>
                        </DialogFooter>
                    </>
            </DialogContent>
        </Dialog>
    )
}


export function OperatorsPage() {
    const list = useQuery({
        queryKey: ["operators"],
        queryFn: () => api<{ items: Operator[] }>("/portal/operators"),
        retry: false,
    })
    const [inviting, setInviting] = useState(false)

    return (
        <Page>
            <PageHeader
                title="Operators"
                actions={
                    <Button onClick={() => setInviting(true)}>
                        <UserPlus className="size-4" aria-hidden /> New operator
                    </Button>
                }
            />

            {list.isPending && <ListSkeleton />}
            {list.isError && <ErrorPanel message={errorMessage(list.error)} />}

            {list.data && list.data.items.length === 0 && (
                <EmptyState
                    icon={UserPlus}
                    title="No staff accounts"
                    description="Create the first operator — their invite token is shown once."
                />
            )}

            {list.data && list.data.items.length > 0 && (
                <div className="rounded-xl border bg-card">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Username</TableHead>
                                <TableHead>Name</TableHead>
                                <TableHead className="w-28">Role</TableHead>
                                <TableHead className="w-32">Created</TableHead>
                                <TableHead className="w-28">State</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {list.data.items.map((operator) => {
                                let roleVariant: "default" | "outline" = "outline"
                                if (operator.role === "ADMIN") roleVariant = "default"
                                let statusText = "Active"
                                let statusCls = "text-sm text-muted-foreground"
                                if (operator.disabledAt) {
                                    statusText = "Disabled"
                                    statusCls = "text-sm font-medium text-destructive"
                                }
                                return (
                                    <TableRow key={operator.id}>
                                        <TableCell className="font-mono text-sm">{operator.username}</TableCell>
                                        <TableCell className="font-medium">{operator.displayName}</TableCell>
                                        <TableCell>
                                            <Badge variant={roleVariant}>
                                                {operator.role}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground">
                                            {dateFormat.format(new Date(operator.createdAt))}
                                        </TableCell>
                                        <TableCell>
                                            <span className={statusCls}>{statusText}</span>
                                        </TableCell>
                                    </TableRow>
                                )
                            })}
                        </TableBody>
                    </Table>
                </div>
            )}

            {inviting && <InviteOperatorDialog open={inviting} onClose={() => setInviting(false)} />}
        </Page>
    )
}
