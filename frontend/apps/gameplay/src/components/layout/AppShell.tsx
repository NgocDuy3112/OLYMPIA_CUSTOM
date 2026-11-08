import { Outlet } from "react-router-dom";
import { NavBar } from "@/components/layout/NavBar";


export function AppShell() {
    return (
        <div className="flex h-dvh flex-col">
            <NavBar />
            <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
                <Outlet />
            </main>
        </div>
    )
}
