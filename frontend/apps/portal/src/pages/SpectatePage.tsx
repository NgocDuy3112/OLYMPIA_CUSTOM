import { useParams } from "react-router-dom"
import { Controller } from "@/console/controller"
import { ApiSurfaceContext } from "@/lib/surface"

/**
 * The link-only spectator deck: the CONTROLLER's pages, read-only.
 *
 * - Data comes from the public /spectate twins (identical payloads — the
 *   surface context swaps the prefix under every query hook).
 * - No portal session is ever needed; the RTC door is the viewer token
 *   (video only — the show's audio lives on the Discord channel where the
 *   host screen-shares this very view).
 * - The .spectate CSS layer strips every button/input, so all round screens
 *   and the lobby render as pure display without touching them.
 */
export function SpectatePage() {
    const { tournamentId, matchId } = useParams()

    return (
        <ApiSurfaceContext.Provider value="spectate">
            <div className="spectate min-h-dvh bg-background">
                <Controller tournamentId={tournamentId ?? ""} matchId={matchId ?? ""} />
            </div>
        </ApiSurfaceContext.Provider>
    )
}

export default SpectatePage
