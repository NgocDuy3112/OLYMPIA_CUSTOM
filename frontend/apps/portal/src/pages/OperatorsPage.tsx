import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Copy, UserPlus } from "lucide-react"
import { ApiError, api } from "@shared/lib/api"
import { Badge } from "@shared/ui/badge"
import { Button } from "@shared/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@shared/ui/dialog"
import { Input } from "@shared/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@shared/ui/table"
import { EmptyState, ErrorPanel, ListSkeleton, Page, PageHeader } from "@/components/page"

// Who may run the show: staff accounts (operators + admins). Creating one
// returns an invite token shown EXACTLY ONCE — the invitee exchanges it for a
// password via POST /portal/invites/accept. There is no invite-accept UI yet,
// so the dialog shows the ready-to-send request itself instead of pretending a
// link exists.
//
//   GET  /portal/operators        → {items}          (ADMIN)
//   POST /portal/operators        → {operatorId, username, inviteToken}  (ADMIN)

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

function messageOf(error: unknown): string {
    if (error instanceof ApiError) return error.message
    return "Something went wrong. Please try again."
}

// ── create dialog: form → the one-time invite panel ───────────────────────────

function InviteOperatorDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
    const queryClient = useQueryClient()
    const [username, setUsername] = useState("")
    const [displayName, setDisplayName] = useState("")
    const [inviteToken, setInviteToken] = useState<string | null>(null)
    const [copied, setCopied] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const reset = () => {
        setUsername("")
        setDisplayName("")
        setInviteToken(null)
        setCopied(false)
        setError(null)
    }

    const create = useMutation({
        mutationFn: () =>
            api<{ inviteToken: string }>("/portal/operators", {
                method: "POST",
                body: JSON.stringify({
                    username: username.trim(),
                    ...(displayName.trim() ? { displayName: displayName.trim() } : {}),
                }),
            }),
        onSuccess: (result) => {
            setInviteToken(result.inviteToken)
            void queryClient.invalidateQueries({ queryKey: ["operators"] })
        },
        onError: (cause) => setError(messageOf(cause)),
    })

    const usernameOk = USERNAME_PATTERN.test(username.trim())
    const reason = !username.trim()
        ? "A username is required"
        : !usernameOk
          ? "3–50 chars: letters, digits, dot, dash, underscore"
          : null

    const request = inviteToken
        ? `POST /portal/invites/accept\n{"token": "${inviteToken}", "password": "<their chosen password>"}`
        : null

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
                {inviteToken ? (
                    <>
                        <DialogHeader>
                            <DialogTitle>Invite created — shown once</DialogTitle>
                            <DialogDescription>
                                Send this to <span className="font-medium not-italic">{username.trim()}</span>.
                                The token is not stored anywhere — losing it means creating the operator again.
                            </DialogDescription>
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
                                    {copied ? "Copied" : "Copy"}
                                </Button>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Accepting the invite has no page yet — they (or you, on their behalf) send:
                            </p>
                            <pre className="overflow-x-auto rounded-lg border bg-muted/50 p-3 font-mono text-xs leading-relaxed">
                                {request}
                            </pre>
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
                    </>
                ) : (
                    <>
                        <DialogHeader>
                            <DialogTitle>New operator</DialogTitle>
                            <DialogDescription>
                                An operator may run matches, judge and manage questions — everything except creating more operators.
                            </DialogDescription>
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
                                {create.isPending ? "Creating…" : "Create operator"}
                            </Button>
                        </DialogFooter>
                    </>
                )}
            </DialogContent>
        </Dialog>
    )
}

// ── the page ──────────────────────────────────────────────────────────────────

export function OperatorsPage() {
    const list = useQuery({
        queryKey: ["operators"],
        queryFn: () => api<{ items: Operator[] }>("/portal/operators"),
        retry: false, // a non-admin gets 403 — that is an answer, not a failure
    })
    const [inviting, setInviting] = useState(false)

    return (
        <Page>
            <PageHeader
                title="Operators"
                description="Who may run the show: staff accounts and their invite state."
                actions={
                    <Button onClick={() => setInviting(true)}>
                        <UserPlus className="size-4" aria-hidden /> New operator
                    </Button>
                }
            />

            {list.isPending && <ListSkeleton />}
            {list.isError && <ErrorPanel message={messageOf(list.error)} />}

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
                            {list.data.items.map((operator) => (
                                <TableRow key={operator.id}>
                                    <TableCell className="font-mono text-sm">{operator.username}</TableCell>
                                    <TableCell className="font-medium">{operator.displayName}</TableCell>
                                    <TableCell>
                                        <Badge variant={operator.role === "ADMIN" ? "default" : "outline"}>
                                            {operator.role}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-sm text-muted-foreground">
                                        {dateFormat.format(new Date(operator.createdAt))}
                                    </TableCell>
                                    <TableCell>
                                        {operator.disabledAt ? (
                                            <span className="text-sm font-medium text-destructive">Disabled</span>
                                        ) : (
                                            <span className="text-sm text-muted-foreground">Active</span>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            )}

            {inviting && <InviteOperatorDialog open={inviting} onClose={() => setInviting(false)} />}
        </Page>
    )
}
