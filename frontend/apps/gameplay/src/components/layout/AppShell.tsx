import { Outlet } from "react-router-dom";


export function AppShell() {
    return (
        <div className="flex h-dvh flex-col">
            <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
                <Outlet />
            </main>
        </div>
    )
}
