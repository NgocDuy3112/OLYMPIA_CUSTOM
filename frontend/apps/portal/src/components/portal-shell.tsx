import { Outlet, useNavigate } from "react-router-dom"
import { Button } from "@shared/ui/button"
import { useLogout } from "@/lib/auth"
import { useMe } from "@/lib/session"

export function PortalShell() {
    const { data } = useMe()
    const logout = useLogout()
    const navigate = useNavigate()

    return (
        <div className="flex min-h-dvh flex-col">
            <header className="flex h-14 items-center justify-between border-b px-4">
                <span className="font-medium">Olympia Custom</span>

                <div className="flex items-center gap-3">
                    {data && (
                        <span className="text-sm text-muted-foreground">
                            {data.displayName}
                        </span>
                    )}
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={logout.isPending}
                        onClick={() =>
                            logout.mutate(undefined, {
                                onSuccess: () => navigate("/login", { replace: true }),
                            })
                        }
                    >
                        {logout.isPending ? "Signing out…" : "Sign out"}
                    </Button>
                </div>
            </header>

            <main className="flex-1">
                <Outlet />
            </main>
        </div>
    )
}