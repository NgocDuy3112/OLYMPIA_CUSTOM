import { Link, Outlet, useLocation } from "react-router-dom"
import { BookOpen, KeyRound, LogOut, ScrollText, Trophy, Users, UsersRound } from "lucide-react"
import { Button } from "@shared/ui/button"
import { SfxUnlockBar } from "@shared/ui/sfx-unlock-bar"
import { useLogout, useMe } from "@/lib/session"


const NAV = [
    {
        to: "/",
        label: "Tournaments",
        icon: Trophy,
        match: (path: string) => path === "/" || path.startsWith("/tournaments"),
    },
    { to: "/players", label: "Thí sinh", icon: UsersRound, match: (p: string) => p === "/players" || p.startsWith("/players") },
    { to: "/questions", label: "Questions", icon: BookOpen, match: (p: string) => p.startsWith("/questions") },
    { to: "/mcp-keys", label: "MCP keys", icon: KeyRound, match: (p: string) => p.startsWith("/mcp-keys") },
    { to: "/operators", label: "Operators", icon: Users, match: (p: string) => p.startsWith("/operators"), adminOnly: true },
    { to: "/audit", label: "Audit log", icon: ScrollText, match: (p: string) => p.startsWith("/audit"), adminOnly: true },
] as const


export function PortalShell() {
    const { data: me } = useMe()
    const logout = useLogout()
    const { pathname } = useLocation()

    return (
        <div className="flex min-h-dvh">
            <a
                href="#portal-main"
                className="sr-only rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground focus-visible:not-sr-only focus-visible:absolute focus-visible:top-2 focus-visible:left-2 focus-visible:z-50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
                Skip to content
            </a>
            <aside className="sticky top-0 flex h-dvh w-14 shrink-0 flex-col overflow-y-auto border-r bg-muted/30 lg:w-56">
                <Link
                    to="/"
                    aria-label="AOC home"
                    className="flex items-center justify-center gap-2 border-b px-2 py-4 font-medium transition-colors outline-none hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50 lg:justify-start lg:px-4"
                >
                    <span
                        className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground"
                        aria-hidden
                    >
                        O
                    </span>
                    <span className="hidden lg:inline">AOC</span>
                </Link>

                <nav className="flex flex-col gap-1 p-2">
                    {NAV.map((item) => {
                        if ("adminOnly" in item && item.adminOnly && me?.role !== "ADMIN") return null
                        const active = item.match(pathname)
                        const Icon = item.icon
                        let ariaCurrent: "page" | undefined = undefined
                        if (active) ariaCurrent = "page"
                        let navCls = "text-muted-foreground hover:bg-muted hover:text-foreground"
                        if (active) navCls = "bg-primary text-primary-foreground"
                        return (
                            <Link
                                key={item.to}
                                to={item.to}
                                aria-label={item.label}
                                title={item.label}
                                aria-current={ariaCurrent}
                                className={`flex items-center justify-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 lg:justify-start ${navCls}`}
                            >
                                <Icon className="size-4 shrink-0" aria-hidden />
                                <span className="hidden lg:inline">{item.label}</span>
                            </Link>
                        )
                    })}
                </nav>

                <div className="mt-auto border-t p-2">
                    <Button
                        variant="ghost"
                        className="w-full justify-center gap-2.5 lg:justify-start"
                        aria-label="Sign out"
                        disabled={logout.isPending}
                        onClick={() => logout.mutate()}
                    >
                        <LogOut className="size-4 shrink-0" aria-hidden />
                        <span className="hidden lg:inline">Sign out</span>
                    </Button>
                </div>
            </aside>

            <main id="portal-main" tabIndex={-1} className="min-w-0 flex-1 outline-none">
                <Outlet />
            </main>

            <SfxUnlockBar />
        </div>
    )
}
