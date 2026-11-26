import { useEffect, useRef, useState } from "react"
import { ConnectionState, Room, RoomEvent } from "livekit-client"
import { api, ApiError } from "../api"
import { errorMessage } from "../error-text"

interface RtcToken {
    url: string
    token: string
    identity: string
    room: string
    expiresIn: number
}

export function fetchPlayerRtcToken(matchId: string): Promise<RtcToken> {
    return api<RtcToken>(`/api/matches/${matchId}/rtc/token`, { method: "POST" })
}

export function fetchOperatorRtcToken(tournamentId: string, matchId: string): Promise<RtcToken> {
    return api<RtcToken>(
        `/portal/tournaments/${tournamentId}/matches/${matchId}/rtc/token`,
        { method: "POST" }
    )
}

export type RtcStatus =
    | "idle"
    | "connecting"
    | "connected"
    | "reconnecting"
    | "disconnected"
    | "failed"

export interface RtcRoomError {
    message: string
    status?: number
}

interface RtcRoomHandle {
    room: Room | null
    status: RtcStatus
    error: RtcRoomError | null
}

export function useRtcRoom(opts: {
    enabled: boolean
    autoSubscribe: boolean
    getToken: () => Promise<RtcToken>
    resetKey?: string
}): RtcRoomHandle {
    const { enabled, autoSubscribe, resetKey } = opts

    const getToken = useRef(opts.getToken)
    useEffect(() => {
        getToken.current = opts.getToken
    })

    const key = `${enabled}|${autoSubscribe}|${resetKey ?? ""}`
    const [dial, setDial] = useState<Dial | null>(null)
    const current = matchingDial(dial, key)

    useEffect(() => {
        if (!enabled) return

        let cancelled = false
        let active: Room | null = null

        const write = (patch: Partial<Omit<Dial, "key">>) => {
            if (cancelled) return
            setDial((prev) => {
                const carry = carriedDial(prev, key)
                return {
                    key,
                    room: null,
                    connection: null,
                    error: null,
                    ...carry,
                    ...patch,
                }
            })
        }

        const onState = (state: ConnectionState) => write({ connection: state })

        void (async () => {
            try {
                const grant = await getToken.current()
                if (cancelled) return

                const next = new Room()
                active = next
                next.on(RoomEvent.ConnectionStateChanged, onState)

                await next.connect(grant.url, grant.token, { autoSubscribe })
                if (cancelled) {
                    await next.disconnect(true)
                    return
                }
                write({ room: next, connection: ConnectionState.Connected })
            } catch (e) {
                if (cancelled) return
                write({
                    error: {
                        message: errorMessage(e),
                        status: apiStatusOf(e),
                    },
                })
                if (active) await active.disconnect(true).catch(() => {})
            }
        })()

        return () => {
            cancelled = true
            if (active) {
                active.off(RoomEvent.ConnectionStateChanged, onState)
                void active.disconnect(true).catch(() => {})
            }
        }
    }, [enabled, autoSubscribe, resetKey, key])

    return {
        room: current?.room ?? null,
        status: statusOf(enabled, current),
        error: current?.error ?? null,
    }
}

interface Dial {
    key: string
    room: Room | null
    connection: ConnectionState | null
    error: RtcRoomError | null
}

function statusOf(enabled: boolean, dial: Dial | null): RtcStatus {
    if (!enabled) return "idle"
    if (!dial) return "connecting"
    if (dial.error) return "failed"
    switch (dial.connection) {
        case ConnectionState.Connected:
            return "connected"
        case ConnectionState.Reconnecting:
            return "reconnecting"
        case ConnectionState.Disconnected:
            return "disconnected"
        default:
            return "connecting"
    }
}

function matchingDial(dial: Dial | null, key: string): Dial | null {
    if (dial === null) return null
    if (dial.key !== key) return null
    return dial
}

function carriedDial(prev: Dial | null, key: string): Partial<Dial> {
    if (prev === null) return {}
    if (prev.key !== key) return {}
    return prev
}

function apiStatusOf(e: unknown): number | undefined {
    if (e instanceof ApiError) return e.status
    return undefined
}
