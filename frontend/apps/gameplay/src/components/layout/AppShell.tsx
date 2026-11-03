import { Outlet } from "react-router-dom";
import { NavBar } from "@/components/layout/NavBar";


export function AppShell() {
    return (
        <div className="flex min-h-dvh flex-col">
            <NavBar />
            {/* a column, so a full-bleed child (the deck) can fill the space
                under the bar instead of only being as tall as its content */}
            <main className="flex flex-1 flex-col">
                <Outlet />
            </main>
        </div>
    )
}