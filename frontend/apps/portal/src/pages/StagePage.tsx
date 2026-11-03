import { useParams } from "react-router-dom"
import { Controller } from "@/console/controller"


export function StagePage() {
    const { tournamentId, matchId } = useParams()

    // h-dvh, not min-h-dvh: the deck canvas asks for 100% of this box.
    return (
        <div className="flex h-dvh w-full flex-col items-center justify-center bg-background p-2">
            <div className="flex w-full max-w-[1800px] flex-1 flex-col">
                <Controller tournamentId={tournamentId!} matchId={matchId!} />
            </div>
        </div>
    )
}
