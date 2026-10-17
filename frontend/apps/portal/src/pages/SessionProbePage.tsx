import { useMe, isUnauthorized } from "@/lib/session"


export function SessionProbe() {
    const { data, error, isPending } = useMe()

    if (isPending) return <p className="p-8">Checking session…</p>
    if (isUnauthorized(error)) return <p className="p-8">Not signed in.</p>
    if (error) return <p className="p-8">Error: {error.message}</p>
    if (!data) return <p className="p-8">No session data.</p>

    return <p className="p-8">Signed in as {data.displayName} ({data.role})</p>
}