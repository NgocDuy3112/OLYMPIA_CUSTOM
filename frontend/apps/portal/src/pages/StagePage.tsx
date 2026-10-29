import { useParams } from "react-router-dom"
import { LiveConsole } from "@/components/live-console"


export function StagePage() {
    const { tournamentId, matchId } = useParams()

    return (
        <div className="flex min-h-screen w-full items-start justify-center bg-background p-2">
            <div className="w-full max-w-[1800px]">
                <LiveConsole tournamentId={tournamentId!} matchId={matchId!} />
            </div>
        </div>
    )
}
