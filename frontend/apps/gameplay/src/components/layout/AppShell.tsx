import { Outlet } from "react-router-dom";
import { NavBar } from "@/components/layout/NavBar";


export function AppShell() {
    return (
        <div className="flex min-h-dvh flex-col">
            <NavBar />
            <main className="flex-1">
                <Outlet />
            </main>
        </div>
    )
}