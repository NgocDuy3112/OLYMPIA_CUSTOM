import { Link, Outlet, useLocation, useNavigate } from "react-router-dom"
import { BookOpen, KeyRound, LogOut, Trophy, Users } from "lucide-react"
import { Button } from "@shared/ui/button"
import { useLogout } from "@/lib/auth"
import { useMe } from "@/lib/session"
import { useMatches } from "@/lib/tournament"

// The sidebar lists GLOBAL features; tournament-scoped screens (matches,
// standings, stages, roster…) stay inside a tournament's own pages — the
// sidebar never offers a second way to the same place. Operators is admin-only:
// the nav mirrors what the role may actually open (its API is ADMIN-gated).
const NAV = [
    {
        to: "/",
        label: "Tournaments",
        icon: Trophy,
        match: (path: string) => path === "/" || path.startsWith("/tournaments"),
    },
    { to: "/questions", label: "Questions", icon: BookOpen, match: (p: string) => p.startsWith("/questions") },
    { to: "/mcp-keys", label: "MCP keys", icon: KeyRound, match: (p: string) => p.startsWith("/mcp-keys") },
    { to: "/operators", label: "Operators", icon: Users, match: (p: string) => p.startsWith("/operators"), adminOnly: true },
] as const


function MatchContext({ tournamentId, matchId }: { tournamentId: string; matchId: string }) {
    const matches = useMatches(tournamentId)
    const match = matches.data?.items.find((m) => m.id === matchId)

    return (
        <div className="border-b px-3 py-2.5 text-sm">
            <p className="flex items-center gap-1.5 font-medium">
                <span className="truncate">{match?.label ?? `Match ${matchId.slice(0, 8)}…`}</span>
                {match?.status === "LIVE" && (
                    <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-emerald-600">
                        <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden />
                        LIVE
                    </span>
                )}
                {match?.status === "FINISHED" && (
                    <span className="shrink-0 text-xs text-muted-foreground">finished</span>
                )}
            </p>
        </div>
    )
}

export function PortalShell() {
    const { data: me } = useMe()
    const logout = useLogout()
    const navigate = useNavigate()
    const { pathname } = useLocation()
    const deep = /^\/tournaments\/([^/]+)\/matches\/([^/]+)$/.exec(pathname)

    return (
        <div className="flex min-h-dvh">
            <aside className="sticky top-0 flex h-dvh w-56 shrink-0 flex-col overflow-y-auto border-r bg-muted/30">
                <Link
                    to="/"
                    className="flex items-center gap-2 border-b px-4 py-4 font-medium transition-colors hover:text-primary"
                >
                    <span
                        className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground"
                        aria-hidden
                    >
                        O
                    </span>
                    Olympia Custom
                </Link>

                {deep && <MatchContext tournamentId={deep[1]} matchId={deep[2]} />}

                <nav className="flex flex-col gap-1 p-2">
                    {NAV.map((item) => {
                        if ("adminOnly" in item && item.adminOnly && me?.role !== "ADMIN") return null
                        const active = item.match(pathname)
                        const Icon = item.icon
                        return (
                            <Link
                                key={item.to}
                                to={item.to}
                                aria-current={active ? "page" : undefined}
                                className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                                    active
                                        ? "bg-primary text-primary-foreground"
                                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                                }`}
                            >
                                <Icon className="size-4 shrink-0" aria-hidden />
                                {item.label}
                            </Link>
                        )
                    })}
                </nav>

                <div className="mt-auto space-y-2 border-t p-3">
                    <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-medium">{me?.displayName ?? "…"}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">{me?.role}</span>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-center"
                        disabled={logout.isPending}
                        onClick={() =>
                            logout.mutate(undefined, {
                                onSuccess: () => navigate("/login", { replace: true }),
                            })
                        }
                    >
                        <LogOut className="size-4" aria-hidden />
                        {logout.isPending ? "Signing out…" : "Sign out"}
                    </Button>
                </div>
            </aside>

            <main className="min-w-0 flex-1">
                <Outlet />
            </main>
        </div>
    )
}
