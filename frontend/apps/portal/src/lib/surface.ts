import { createContext, useContext } from "react"

// Which data surface this tree reads. The controller console talks to /portal/*;
// the spectator page (public, link-only, Discord carries the show's audio) talks
// to the /spectate/* twins — IDENTICAL paths and payloads, so every existing
// query hook works unchanged behind one prefix swap.
export type ApiSurface = "portal" | "spectate"

export const ApiSurfaceContext = createContext<ApiSurface>("portal")

const PREFIX: Record<ApiSurface, string> = {
    portal: "/portal",
    spectate: "/spectate",
}

/** The base path for this tree's tournament/match queries. */
export function useApiPrefix(): string {
    return PREFIX[useContext(ApiSurfaceContext)]
}

/** The raw surface — for choices that aren't path-shaped (e.g. which RTC door). */
export function useApiSurface(): ApiSurface {
    return useContext(ApiSurfaceContext)
}
