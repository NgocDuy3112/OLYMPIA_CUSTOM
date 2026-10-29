import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Copy, Plus, Trash2 } from "lucide-react"
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


type Scope = "READ" | "WRITE" | "ANNOUNCE"
const ALL_SCOPES: Scope[] = ["READ", "WRITE", "ANNOUNCE"]
// The backend's default when scopes are omitted.
const DEFAULT_SCOPES: Scope[] = ["READ"]

interface McpKey {
    id: string
    label: string
    prefix: string
    scopes: Scope[]
    expiresAt: string | null
    revokedAt: string | null
    lastUsedAt: string | null
    createdAt: string
}

interface Page {
    items: McpKey[]
    total: number
}

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" })

function statusOf(key: McpKey): { label: string; className: string } {
    if (key.revokedAt) return { label: "Revoked", className: "line-through opacity-60" }
    if (key.expiresAt && new Date(key.expiresAt).getTime() < Date.now()) {
        return { label: "Expired", className: "opacity-60" }
    }
    return { label: "Active", className: "text-emerald-600" }
}

function messageOf(error: unknown): string {
    if (error instanceof ApiError) return error.message
    return "Something went wrong. Please try again."
}

// ── issue dialog: form → the one-time token panel ─────────────────────────────

function IssueKeyDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
    const queryClient = useQueryClient()
    const [label, setLabel] = useState("")
    const [scopes, setScopes] = useState<Scope[]>(DEFAULT_SCOPES)
    const [expiresOn, setExpiresOn] = useState("")
    const [issued, setIssued] = useState<string | null>(null)
    const [copied, setCopied] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const reset = () => {
        setLabel("")
        setScopes(DEFAULT_SCOPES)
        setExpiresOn("")
        setIssued(null)
        setCopied(false)
        setError(null)
    }

    const issue = useMutation({
        mutationFn: () => {
            const body: Record<string, unknown> = { label: label.trim(), scopes }
            if (expiresOn) body.expiresAt = new Date(`${expiresOn}T00:00:00Z`).toISOString()
            return api<{ token: string }>("/portal/mcp-keys", { method: "POST", body: JSON.stringify(body) })
        },
        onSuccess: (result) => {
            setIssued(result.token)
            void queryClient.invalidateQueries({ queryKey: ["mcp-keys"] })
        },
        onError: (cause) => setError(messageOf(cause)),
    })

    const toggleScope = (scope: Scope) =>
        setScopes((current) =>
            current.includes(scope) ? current.filter((s) => s !== scope) : [...current, scope]
        )

    const reason = !label.trim() ? "A label says what this key is for" : scopes.length === 0 ? "Pick at least one scope" : null

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
                {issued ? (
                    <>
                        <DialogHeader>
                            <DialogTitle>Key issued — shown once</DialogTitle>
                            <DialogDescription>
                                The server keeps only a hash. Copy it now — closing this dialog loses it forever.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="flex items-center gap-2 rounded-lg border bg-muted/50 p-3">
                            <code className="min-w-0 flex-1 break-all font-mono text-xs">{issued}</code>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                    void navigator.clipboard.writeText(issued)
                                    setCopied(true)
                                }}
                            >
                                <Copy className="size-3.5" aria-hidden />
                                {copied ? "Copied" : "Copy"}
                            </Button>
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
                            <DialogTitle>New MCP key</DialogTitle>
                            <DialogDescription>
                                A key lets an MCP agent read (and with WRITE, edit) within its scopes — never publish or score.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="grid gap-4">
                            <div className="grid gap-2">
                                <label className="text-sm font-medium" htmlFor="key-label">Label</label>
                                <Input
                                    id="key-label"
                                    value={label}
                                    onChange={(event) => setLabel(event.target.value)}
                                    placeholder="CI bot · read-only"
                                    maxLength={100}
                                />
                            </div>

                            <div className="grid gap-2">
                                <span className="text-sm font-medium">Scopes</span>
                                <div className="flex flex-wrap gap-4">
                                    {ALL_SCOPES.map((scope) => (
                                        <label key={scope} className="flex items-center gap-2 text-sm">
                                            <input
                                                type="checkbox"
                                                checked={scopes.includes(scope)}
                                                onChange={() => toggleScope(scope)}
                                                className="size-4"
                                            />
                                            {scope}
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div className="grid gap-2">
                                <label className="text-sm font-medium" htmlFor="key-expires">Expires (optional)</label>
                                <Input
                                    id="key-expires"
                                    type="date"
                                    value={expiresOn}
                                    onChange={(event) => setExpiresOn(event.target.value)}
                                />
                            </div>

                            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
                        </div>

                        <DialogFooter className="items-center gap-2">
                            <span className="mr-auto text-xs text-muted-foreground">{reason}</span>
                            <Button variant="outline" onClick={() => { reset(); onClose() }}>Cancel</Button>
                            <Button disabled={reason !== null || issue.isPending} onClick={() => issue.mutate()}>
                                {issue.isPending ? "Issuing…" : "Issue key"}
                            </Button>
                        </DialogFooter>
                    </>
                )}
            </DialogContent>
        </Dialog>
    )
}

// ── revoke: one-way → confirm in a dialog ─────────────────────────────────────

function RevokeDialog({ keyRow, onClose }: { keyRow: McpKey | null; onClose: () => void }) {
    const queryClient = useQueryClient()
    const [error, setError] = useState<string | null>(null)

    const revoke = useMutation({
        mutationFn: () => api(`/portal/mcp-keys/${keyRow!.id}`, { method: "DELETE" }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["mcp-keys"] })
            onClose()
        },
        onError: (cause) => setError(messageOf(cause)),
    })

    return (
        <Dialog
            open={keyRow !== null}
            onOpenChange={(next) => {
                if (!next) onClose()
            }}
        >
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Revoke this key?</DialogTitle>
                    <DialogDescription>
                        <code className="font-mono">{keyRow?.prefix}…</code> ({keyRow?.label}) stops working
                        immediately. This cannot be undone.
                    </DialogDescription>
                </DialogHeader>
                {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
                <DialogFooter className="gap-2">
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button
                        variant="destructive"
                        disabled={revoke.isPending}
                        onClick={() => revoke.mutate()}
                    >
                        {revoke.isPending ? "Revoking…" : "Revoke key"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

// ── the page ──────────────────────────────────────────────────────────────────

export function McpKeysPage() {
    const list = useQuery({
        queryKey: ["mcp-keys"],
        queryFn: () => api<Page>("/portal/mcp-keys?limit=50&offset=0"),
    })

    const [issuing, setIssuing] = useState(false)
    const [revoking, setRevoking] = useState<McpKey | null>(null)

    return (
        <Page>
            <PageHeader
                title="MCP keys"
                actions={
                    <Button onClick={() => setIssuing(true)}>
                        <Plus className="size-4" aria-hidden /> New key
                    </Button>
                }
            />

            {list.isPending && <ListSkeleton />}
            {list.isError && <ErrorPanel message={messageOf(list.error)} />}

            {list.data && list.data.items.length === 0 && (
                <EmptyState
                    icon={Copy}
                    title="No keys yet"
                    description="Issue the first key for the agent that should read your tournaments."
                />
            )}

            {list.data && list.data.items.length > 0 && (
                <div className="rounded-xl border bg-card">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-40">Prefix</TableHead>
                                <TableHead>Label</TableHead>
                                <TableHead className="w-44">Scopes</TableHead>
                                <TableHead className="w-28">Status</TableHead>
                                <TableHead className="w-32">Last used</TableHead>
                                <TableHead className="w-32">Expires</TableHead>
                                <TableHead className="w-28 text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {list.data.items.map((key) => {
                                const status = statusOf(key)
                                return (
                                    <TableRow key={key.id}>
                                        <TableCell className="font-mono text-sm">{key.prefix}…</TableCell>
                                        <TableCell className="font-medium">{key.label}</TableCell>
                                        <TableCell>
                                            <span className="flex flex-wrap gap-1">
                                                {key.scopes.map((scope) => (
                                                    <Badge key={scope} variant="outline">{scope}</Badge>
                                                ))}
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            <span className={`text-sm font-medium ${status.className}`}>{status.label}</span>
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground">
                                            {key.lastUsedAt ? dateFormat.format(new Date(key.lastUsedAt)) : "never"}
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground">
                                            {key.expiresAt ? dateFormat.format(new Date(key.expiresAt)) : "never"}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                disabled={key.revokedAt !== null}
                                                title={key.revokedAt ? "Already revoked" : "Stop this key from working"}
                                                onClick={() => setRevoking(key)}
                                            >
                                                <Trash2 className="size-3.5" aria-hidden /> Revoke
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                )
                            })}
                        </TableBody>
                    </Table>
                </div>
            )}

            {issuing && <IssueKeyDialog open={issuing} onClose={() => setIssuing(false)} />}
            <RevokeDialog keyRow={revoking} onClose={() => setRevoking(null)} />
        </Page>
    )
}
