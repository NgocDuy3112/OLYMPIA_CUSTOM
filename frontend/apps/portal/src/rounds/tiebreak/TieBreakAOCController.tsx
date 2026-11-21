import { useParams } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ConsoleStage, QuestionCard, Rail, Timer } from "@/components/stage/deck"
import { backToLobbyAction } from "@/components/stage/actions"
import { api, ApiError } from "@shared/lib/api"
import { useCountdown, useServerClock } from "@shared/lib/clock"
import type { ScreenCore } from "@/rounds/types"
import type { TieBreakPostBody, TieBreakView } from "./types"

export type TieBreakCtx = ScreenCore

function tieBreakKey(tournamentId: string, matchId: string) {
    return ["tiebreak", tournamentId, matchId] as const
}

function postTiebreak(tournamentId: string, matchId: string, body: TieBreakPostBody) {
    return api<TieBreakView>(
        `/portal/tournaments/${tournamentId}/matches/${matchId}/live/tiebreak`,
        { method: "POST", body: JSON.stringify(body) }
    )
}

export function TieBreakAOCController({ ctx }: { ctx: TieBreakCtx }) {
    const { tournamentId, matchId } = useParams()
    const queryClient = useQueryClient()
    const clock = useServerClock()
    const tid = tournamentId ?? ""
    const mid = matchId ?? ""
    const query = useQuery({
        queryKey: tieBreakKey(tid, mid),
        queryFn: () =>
            api<TieBreakView>(`/portal/tournaments/${tid}/matches/${mid}/live/tiebreak`),
        enabled: Boolean(tid && mid),
        refetchInterval: 3_000,
        retry: false,
        staleTime: 0,
    })
    const view = query.data ?? null
    const remaining = useCountdown(view?.deadlineAt ?? null, clock)
    const mutation = useMutation({
        mutationFn: (body: TieBreakPostBody) => postTiebreak(tid, mid, body),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: tieBreakKey(tid, mid) })
            void queryClient.invalidateQueries({ queryKey: ["live"] })
        },
        onError: (error) => {
            if (error instanceof ApiError) {
                if (error.status === 409) {
                    void queryClient.invalidateQueries({ queryKey: tieBreakKey(tid, mid) })
                    void queryClient.invalidateQueries({ queryKey: ["live"] })
                }
            }
        },
    })
    const sendOnce = (body: TieBreakPostBody) => mutation.mutateAsync(body)
    const send = (body: TieBreakPostBody) => {
        const attempt = sendOnce(body).catch((error: unknown) => {
            if (error instanceof ApiError) {
                if (error.status === 409) {
                    void query.refetch().then((fresh) => {
                        const nextVersion = fresh.data?.version
                        if (nextVersion !== undefined) {
                            void sendOnce({ ...body, expectedVersion: nextVersion })
                        }
                    })
                }
            }
        })
        void attempt
    }

    let picked: string[] = []
    if (ctx.selectedIds.size >= 2) picked = [...ctx.selectedIds]
    if (picked.length === 0) picked = ctx.baseCards.map((card) => card.id)

    let startClick: (() => void) | undefined = undefined
    if (view === null) {
        if (picked.length >= 2) {
            const playerIds = picked
            const expectedVersion = ctx.v.version
            startClick = () => send({ action: "start", playerIds, expectedVersion })
        }
    }
    if (view !== null) {
        if (view.ended) {
            if (picked.length >= 2) {
                const playerIds = picked
                const expectedVersion = view.version
                startClick = () => send({ action: "start", playerIds, expectedVersion })
            }
        }
    }

    let openClick: (() => void) | undefined = undefined
    if (view !== null) {
        if (!view.ended) {
            if (!view.windowOpen) {
                const expectedVersion = view.version
                openClick = () => send({ action: "open-buzz", expectedVersion })
            }
        }
    }
    let lockClick: (() => void) | undefined = undefined
    if (view !== null) {
        if (!view.ended) {
            if (view.windowOpen) {
                const expectedVersion = view.version
                lockClick = () => send({ action: "lock-buzz", expectedVersion })
            }
        }
    }

    let judgeRight: (() => void) | undefined = undefined
    let judgeWrong: (() => void) | undefined = undefined
    if (view !== null) {
        if (!view.ended) {
            if (view.window.buzzer !== null) {
                const expectedVersion = view.version
                judgeRight = () => send({ action: "judge", correct: true, expectedVersion })
                judgeWrong = () => send({ action: "judge", correct: false, expectedVersion })
            }
        }
    }

    let advanceClick: (() => void) | undefined = undefined
    if (view !== null) {
        if (!view.ended) {
            const expectedVersion = view.version
            advanceClick = () => send({ action: "advance", expectedVersion })
        }
    }
    let endClick: (() => void) | undefined = undefined
    if (view !== null) {
        if (!view.ended) {
            const expectedVersion = view.version
            endClick = () => send({ action: "end", expectedVersion })
        }
    }

    const cards = view === null ? ctx.baseCards : view.players.map((player) => ({
        id: player.id,
        name: player.displayName,
        points: player.points,
        dimmed: player.eliminated,
        buzzing: view.window.buzzer === player.id,
        ring: ctx.selectedIds.has(player.id) ? ("selected" as const) : undefined,
    }))

    let timerRemaining: number | null = null
    if (view?.deadlineAt) timerRemaining = remaining

    let flash = ctx.flash
    if (query.isError) {
        if (flash === null) {
            if (query.error instanceof ApiError) {
                if (query.error.status !== 404) flash = query.error.message
            }
            if (!(query.error instanceof ApiError)) {
                if (query.error instanceof Error) flash = query.error.message
            }
        }
    }
    if (mutation.isError) {
        if (flash === null) {
            if (mutation.error instanceof Error) flash = mutation.error.message
        }
    }

    return (
        <ConsoleStage
            rail={<Rail cards={cards} onSelect={ctx.toggleSelect} onScoreClick={ctx.openRegrade} />}
            actions={[
                { label: "Bắt đầu", onClick: startClick },
                { label: "Mở chuông", onClick: openClick },
                { label: "Khóa chuông", onClick: lockClick },
                { label: "Đúng", onClick: judgeRight },
                { label: "Sai", onClick: judgeWrong },
                { label: "Câu tiếp", onClick: advanceClick },
                { label: "Kết thúc", onClick: endClick },
                backToLobbyAction(ctx.backToLobby),
            ]}
            flash={flash}
        >
            <QuestionCard
                round="Câu hỏi phụ"
                right={<Timer remaining={timerRemaining} />}
                question={view?.question?.questionText ?? null}
                media={view?.question?.media ?? null}
            />
        </ConsoleStage>
    )
}
