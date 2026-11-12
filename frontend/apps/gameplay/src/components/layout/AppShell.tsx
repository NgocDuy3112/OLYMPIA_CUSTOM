import { Outlet, useLocation } from "react-router-dom";
import { NavBar } from "@/components/layout/NavBar";


export function AppShell() {
    const { pathname } = useLocation()
    // Inside a match the player's deck owns the whole page — the site header
    // would only sit on top of the stage, so it is not rendered there.
    const inMatch = /\/matches\/[^/]+\/?$/.test(pathname)

    return (
        <div className="flex h-dvh flex-col">
            {!inMatch && <NavBar />}
            <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
                <Outlet />
            </main>
        </div>
    )
}
