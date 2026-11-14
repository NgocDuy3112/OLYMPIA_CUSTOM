import { Outlet, useLocation } from "react-router-dom";
import { NavBar } from "@/components/layout/NavBar";


export function AppShell() {
    const { pathname } = useLocation()
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
