import { useParams } from "react-router-dom"
import { Controller } from "@/console/controller"


export function StagePage() {
    const { tournamentId, matchId } = useParams()

    return (
        <div className="flex h-dvh w-full flex-col bg-background">
            <div className="flex w-full flex-1 flex-col">
                <Controller tournamentId={tournamentId!} matchId={matchId!} />
            </div>
        </div>
    )
}
