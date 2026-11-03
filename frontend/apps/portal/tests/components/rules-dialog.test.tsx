// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { TournamentRulesDialog } from "@/components/tournament-rules-dialog"
import type { TournamentDetail } from "@/lib/tournament"

// The rules dialog's two jobs: pick WHICH rounds the tournament plays, and edit
// what each one does. The picker is load-bearing — a tournament with no rounds
// has nothing for a match to play — and it shipped with a crash: checking a round
// made its section read `undefined.scoring` and blanked the whole app. Hence this
// file.

const TOURNAMENT = "t1"

function tournament(over: Partial<TournamentDetail> = {}): TournamentDetail {
    return {
        id: TOURNAMENT,
        name: "Cup",
        slug: "cup",
        visibility: "PUBLIC",
        ownerId: "o1",
        current: false,
        stages: [{ id: "s1", title: "Stage" }],
        rounds: [{ id: "khoi-dong", name: "Khởi động", order: 0, chart: "bars" }],
        format: { competitorsPerMatch: 4 },
        roundRules: null,
        places: 0,
        closedAt: null,
        createdAt: "",
        updatedAt: "",
        ...over,
    }
}

function draw(view: TournamentDetail = tournament()) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    return render(
        <QueryClientProvider client={client}>
            <TournamentRulesDialog
                tournamentId={TOURNAMENT}
                tournament={view}
                frozen={false}
                open
                onOpenChange={() => {}}
            />
        </QueryClientProvider>
    )
}

const boxFor = (name: string) => {
    const label = [...document.querySelectorAll("label")].find((l) => (l.textContent || "").includes(name))
    const box = label?.querySelector('input[type="checkbox"]')
    if (!box) throw new Error(`no checkbox for ${name}`)
    return box as HTMLInputElement
}

afterEach(cleanup)

describe("the round picker", () => {
    it("offers the four rounds the deck can draw, nothing else", () => {
        draw()
        for (const name of ["Khởi động", "Giải mã", "Bứt phá", "Về đích"]) {
            expect(boxFor(name)).toBeTruthy()
        }
    })

    it("marks the rounds the tournament already plays", () => {
        draw()
        expect(boxFor("Khởi động").checked).toBe(true)
        expect(boxFor("Giải mã").checked).toBe(false)
    })

    it("renders the new round's rules when one is checked — and does not crash", () => {
        draw()
        // the regression: this used to throw on `undefined.scoring`
        boxFor("Giải mã").click()
        // twice now: the checklist entry AND the rules section it seeds
        expect(screen.getAllByText("Giải mã")).toHaveLength(2)
        // its section is editable: the kind checkboxes for the new round are there
        expect(screen.getAllByText("CHOICE").length).toBeGreaterThan(0)
    })

    it("enables Save once the list changes", async () => {
        draw()
        const save = screen.getByRole("button", { name: /Save rules/ })
        expect(save).toBeDisabled()
        boxFor("Bứt phá").click()
        await waitFor(() => expect(save).toBeEnabled())
    })

    it("sends the ordered list together with the rules", async () => {
        const calls: Array<{ url: string; body: unknown }> = []
        const fetchMock = (input: RequestInfo | URL, init?: RequestInit) => {
            calls.push({ url: String(input), body: init?.body ? JSON.parse(String(init.body)) : null })
            return Promise.resolve({ ok: true, status: 200, json: async () => tournament() } as unknown as Response)
        }
        const original = globalThis.fetch
        globalThis.fetch = fetchMock as typeof fetch
        try {
            draw()
            boxFor("Về đích").click()
            await userEvent.click(screen.getByRole("button", { name: /Save rules/ }))
            await waitFor(() => expect(calls.length).toBeGreaterThan(0))
            const body = calls[0].body as { rounds: Array<{ id: string }>; roundRules: Record<string, unknown> }
            expect(body.rounds.map((r) => r.id)).toEqual(["khoi-dong", "ve-dich"])
            expect(Object.keys(body.roundRules)).toEqual(["khoi-dong", "ve-dich"])
        } finally {
            globalThis.fetch = original
        }
    })
})

describe("an empty tournament", () => {
    it("says why nothing is playable", () => {
        draw(tournament({ rounds: [] }))
        expect(screen.getByText(/No rounds yet/)).toBeInTheDocument()
    })

    it("start from zero: checking one round is enough to save", async () => {
        draw(tournament({ rounds: [] }))
        boxFor("Khởi động").click()
        await waitFor(() => expect(screen.getByRole("button", { name: /Save rules/ })).toBeEnabled())
    })
})
