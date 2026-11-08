import type { ReactNode } from "react"
import { Navigate, useLocation } from "react-router-dom"
import { isUnauthorized, useMe } from "@/lib/session"

function CheckingSession() {
    return (
        <div className="flex min-h-[50vh] items-center justify-center text-sm text-muted-foreground">
            Checking session…
        </div>
    )
}

export function RequireAuth({ children }: { children: ReactNode }) {
    const { data, error, isPending } = useMe()
    const location = useLocation()

    if (isPending) return <CheckingSession />

    if (isUnauthorized(error) || !data) {
        return (
            <Navigate
                to="/login"
                replace
                state={{ from: location.pathname + location.search }}
            />
        )
    }

    return <>{children}</>
}

export function RedirectIfSignedIn({ children }: { children: ReactNode }) {
    const { data, isPending } = useMe()

    if (isPending) return <CheckingSession />

    if (data) return <Navigate to="/" replace />

    return <>{children}</>
}
