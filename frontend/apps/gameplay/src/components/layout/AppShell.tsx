import { Outlet } from "react-router-dom";
import { NavBar } from "@/components/layout/NavBar";


export function AppShell() {
    // A DEFINITE height, not just a minimum: the deck's canvas sizes itself from
    // the space it is given (`height: 100%`), and a percentage only resolves
    // against a definite height. min-h-dvh left it indefinite, which collapsed the
    // canvas to 0×0. `overflow-y-auto` on main keeps the ordinary scrolling pages
    // (schedule, standings) working.
    return (
        <div className="flex h-dvh flex-col">
            <NavBar />
            <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
                <Outlet />
            </main>
        </div>
    )
}