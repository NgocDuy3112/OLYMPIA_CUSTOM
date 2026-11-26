import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Copy, Plus, Trash2 } from "lucide-react"
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


interface ScopeInfo {
    id: string
    title: string
    tools: string[]
    default: boolean
}

interface ScopesResponse {
    scopes: ScopeInfo[]
}

interface McpKey {
    id: string
    label: string
    prefix: string
    scopes: string[]
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

function toolsOfScopeIds(catalogue: ScopeInfo[], scopeIds: string[]): string[] {
    const granted = new Set(scopeIds)
    const tools = new Set<string>()
    for (const scope of catalogue) {
        if (!granted.has(scope.id)) continue
        for (const tool of scope.tools) tools.add(tool)
    }
    return [...tools]
}

function statusOf(key: McpKey): { label: string; className: string } {
    if (key.revokedAt) return { label: "Revoked", className: "line-through opacity-60" }
    if (key.expiresAt && new Date(key.expiresAt).getTime() < Date.now()) {
        return { label: "Expired", className: "opacity-60" }
    }
    return { label: "Active", className: "text-emerald-600" }
}

function IssueKeyDialog({
    open,
    onClose,
    catalogue,
}: {
    open: boolean
    onClose: () => void
    catalogue: ScopeInfo[]
}) {
    const queryClient = useQueryClient()
    const defaults = catalogue.filter((scope) => scope.default).map((scope) => scope.id)
    const [label, setLabel] = useState("")
    const [selected, setSelected] = useState<string[]>(defaults)
    const [expiresOn, setExpiresOn] = useState("")
    const [issued, setIssued] = useState<string | null>(null)
    const [copied, setCopied] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const reset = () => {
        setLabel("")
        setSelected(defaults)
        setExpiresOn("")
        setIssued(null)
        setCopied(false)
        setError(null)
    }

    const issue = useMutation({
        mutationFn: () => {
            const body: Record<string, unknown> = { label: label.trim(), scopes: selected }
            if (expiresOn) body.expiresAt = new Date(`${expiresOn}T00:00:00Z`).toISOString()
            return api<{ token: string }>("/portal/mcp-keys", { method: "POST", body: JSON.stringify(body) })
        },
        onSuccess: (result) => {
            setIssued(result.token)
            void queryClient.invalidateQueries({ queryKey: ["mcp-keys"] })
        },
        onError: (cause) => setError(errorMessage(cause)),
    })

    const toggleScope = (scopeId: string) =>
        setSelected((current) => {
            if (current.includes(scopeId)) return current.filter((id) => id !== scopeId)
            return [...current, scopeId]
        })

    let reason: string | null = null
    if (selected.length === 0) reason = "Pick at least one scope"
    if (!label.trim()) reason = "A label says what this key is for"
    let copyLabel = "Copy"
    if (copied) copyLabel = "Copied"
    let issueLabel = "Issue key"
    if (issue.isPending) issueLabel = "Issuing…"

    if (issued) {
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
                        <DialogTitle>Key issued — shown once</DialogTitle>
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
                            {copyLabel}
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
                            <DialogTitle>New MCP key</DialogTitle>
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
                                <div className="grid gap-2">
                                    {catalogue.map((scope) => (
                                        <label key={scope.id} className="flex items-center gap-2 text-sm">
                                            <input
                                                type="checkbox"
                                                checked={selected.includes(scope.id)}
                                                onChange={() => toggleScope(scope.id)}
                                                className="size-4"
                                            />
                                            <span>{scope.title}</span>
                                            <span className="font-mono text-xs text-muted-foreground">{scope.id}</span>
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
                                {issueLabel}
                            </Button>
                        </DialogFooter>
                    </>
            </DialogContent>
        </Dialog>
    )
}


function RevokeDialog({ keyRow, onClose }: { keyRow: McpKey | null; onClose: () => void }) {
    const queryClient = useQueryClient()
    const [error, setError] = useState<string | null>(null)

    const revoke = useMutation({
        mutationFn: (id: string) =>
            api<{ revoked: number; ids: string[] }>("/portal/mcp-keys/revoke", {
                method: "POST",
                body: JSON.stringify({ ids: [id] }),
            }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["mcp-keys"] })
            onClose()
        },
        onError: (cause) => setError(errorMessage(cause)),
    })

    let revokeLabel = "Revoke key"
    if (revoke.isPending) revokeLabel = "Revoking…"

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
                </DialogHeader>
                {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
                <DialogFooter className="gap-2">
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button
                        variant="destructive"
                        disabled={revoke.isPending}
                        onClick={() => {
                            if (keyRow !== null) revoke.mutate(keyRow.id)
                        }}
                    >
                        {revokeLabel}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}


export function McpKeysPage() {
    const list = useQuery({
        queryKey: ["mcp-keys"],
        queryFn: () => api<Page>("/portal/mcp-keys?limit=50&offset=0"),
    })

    const scopes = useQuery({
        queryKey: ["mcp-keys", "scopes"],
        queryFn: () => api<ScopesResponse>("/portal/mcp-keys/scopes"),
    })

    const [issuing, setIssuing] = useState(false)
    const [revoking, setRevoking] = useState<McpKey | null>(null)

    return (
        <Page>
            <PageHeader
                title="MCP keys"
                actions={
                    <Button disabled={!scopes.data} onClick={() => setIssuing(true)}>
                        <Plus className="size-4" aria-hidden /> New key
                    </Button>
                }
            />

            {(list.isPending || scopes.isPending) && <ListSkeleton />}
            {list.isError && <ErrorPanel message={errorMessage(list.error)} />}
            {scopes.isError && <ErrorPanel message={errorMessage(scopes.error)} />}

            {list.data && list.data.items.length === 0 && (
                <EmptyState
                    icon={Copy}
                    title="No keys yet"
                    description="Issue the first key for the agent that should read your tournaments."
                />
            )}

            {list.data && scopes.data && list.data.items.length > 0 && (
                <div className="rounded-xl border bg-card">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-40">Prefix</TableHead>
                                <TableHead>Label</TableHead>
                                <TableHead className="w-44">Scopes</TableHead>
                                <TableHead>Tools</TableHead>
                                <TableHead className="w-28">Status</TableHead>
                                <TableHead className="w-32">Last used</TableHead>
                                <TableHead className="w-32">Expires</TableHead>
                                <TableHead className="w-28 text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {list.data.items.map((key) => {
                                const status = statusOf(key)
                                let lastUsed = "never"
                                if (key.lastUsedAt) lastUsed = dateFormat.format(new Date(key.lastUsedAt))
                                let expires = "never"
                                if (key.expiresAt) expires = dateFormat.format(new Date(key.expiresAt))
                                let revokeTitle = "Stop this key from working"
                                if (key.revokedAt) revokeTitle = "Already revoked"
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
                                            <span className="flex flex-wrap gap-1">
                                                {toolsOfScopeIds(scopes.data.scopes, key.scopes).map((tool) => (
                                                    <Badge key={tool} variant="secondary" className="font-mono">
                                                        {tool}
                                                    </Badge>
                                                ))}
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            <span className={`text-sm font-medium ${status.className}`}>{status.label}</span>
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground">
                                            {lastUsed}
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground">
                                            {expires}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                disabled={key.revokedAt !== null}
                                                title={revokeTitle}
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

            {issuing && scopes.data && (
                <IssueKeyDialog
                    open={issuing}
                    onClose={() => setIssuing(false)}
                    catalogue={scopes.data.scopes}
                />
            )}
            <RevokeDialog keyRow={revoking} onClose={() => setRevoking(null)} />
        </Page>
    )
}
