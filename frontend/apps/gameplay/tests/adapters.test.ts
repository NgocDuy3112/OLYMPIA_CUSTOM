import { describe, expect, it } from "vitest"
import type { Match, TournamentRound } from "@/lib/api"
import { roundNameOf, showDate, showTime, toMatch, toStandings } from "@/lib/adapters"

// The adapters' three jobs: the show's wall clock, the seat+result merge, and
// the round-id → round-name rekey.

const ROUNDS: TournamentRound[] = [
    { id: "khoi-dong", name: "Khởi động", order: 1, chart: "bars" },
    { id: "giai-ma", name: "Giải mã", order: 2, chart: "bars" },
    { id: "but-pha", name: "Bứt phá", order: 3, chart: "bars" },
    { id: "ve-dich", name: "Về đích", order: 4, chart: "grid" },
]

const wireMatch = (overrides: Partial<Match> = {}): Match => ({
    id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    stageId: "playoffs",
    slot: 1,
    status: "UPCOMING",
    // 03:30 UTC = 10:30 in Asia/Ho_Chi_Minh (UTC+7, no DST).
    scheduledAt: "2026-02-01T03:30:00.000Z",
    round: "Vòng Playoffs · Quarterfinal 1",
    players: [
        { id: "11111111-1111-1111-1111-111111111111", name: "A. Voss", seed: 1 },
        { id: "22222222-2222-2222-2222-222222222222", name: "D. Chen", seed: 2 },
    ],
    ...overrides,
})


describe("the show's wall clock", () => {
    it("splits an instant into the show's date and time, not the browser's", () => {
        const view = toMatch(wireMatch(), ROUNDS)
        expect(view.date).toBe("2026-02-01")
        expect(view.startTime).toBe("10:30")
    })

    it("rolls the date over at Vietnamese midnight, not UTC's", () => {
        // 17:30 UTC = 00:30 the NEXT day in Ho Chi Minh City.
        const view = toMatch(
            wireMatch({ scheduledAt: "2026-01-31T17:30:00.000Z" }),
            ROUNDS
        )
        expect(view.date).toBe("2026-02-01")
        expect(view.startTime).toBe("00:30")
    })

    it("renders midnight as 00:00, never 24:00", () => {
        expect(showTime("2026-01-31T17:00:00.000Z")).toBe("00:00")
    })

    it("formatting is timezone-stable regardless of the environment", () => {
        // Same instant, expressed for every test run the same way.
        expect(showDate("2026-02-01T03:30:00.000Z")).toBe("2026-02-01")
        expect(showTime("2026-02-01T03:30:00.000Z")).toBe("10:30")
    })
})


describe("toMatch — the merge", () => {
    it("keeps the seats bare when there are no results", () => {
        const view = toMatch(wireMatch(), ROUNDS)

        expect(view.players).toHaveLength(2)
        for (const player of view.players) {
            expect(player).not.toHaveProperty("score")
            expect(player).not.toHaveProperty("rank")
            expect(player).not.toHaveProperty("roundScores")
        }
        expect(view.status).toBe("UPCOMING")
    })

    it("overlays the results onto the seats of a FINISHED match", () => {
        const view = toMatch(
            wireMatch({
                status: "FINISHED",
                results: [
                    {
                        id: "11111111-1111-1111-1111-111111111111",
                        name: "A. Voss",
                        totalScore: 24,
                        rank: 1,
                        roundScores: { "khoi-dong": 10, "ve-dich": 14 },
                    },
                    {
                        id: "22222222-2222-2222-2222-222222222222",
                        name: "D. Chen",
                        totalScore: 21,
                        rank: 2,
                        roundScores: { "khoi-dong": 8, "ve-dich": 13 },
                    },
                ],
            }),
            ROUNDS
        )

        const [first, second] = view.players
        expect(first).toMatchObject({ score: 24, rank: 1 })
        expect(second).toMatchObject({ score: 21, rank: 2 })
        // The round scores arrive rekeyed to names.
        expect(first!.roundScores).toEqual({ "Khởi động": 10, "Về đích": 14 })
    })

    it("follows the seat order, not the result order", () => {
        const view = toMatch(
            wireMatch({
                status: "FINISHED",
                results: [
                    {
                        id: "22222222-2222-2222-2222-222222222222",
                        name: "D. Chen",
                        totalScore: 21,
                        rank: 2,
                        roundScores: {},
                    },
                ],
            }),
            ROUNDS
        )

        expect(view.players.map((p) => p.id)).toEqual([
            "11111111-1111-1111-1111-111111111111",
            "22222222-2222-2222-2222-222222222222",
        ])
        expect(view.players[0]).not.toHaveProperty("score")
        expect(view.players[1]).toMatchObject({ score: 21, rank: 2 })
    })

    it("passes the display fields through untouched", () => {
        const view = toMatch(wireMatch({ slot: 2 }), ROUNDS)

        expect(view.id).toBe(wireMatch().id)
        expect(view.stageId).toBe("playoffs")
        expect(view.slot).toBe(2)
        expect(view.round).toBe("Vòng Playoffs · Quarterfinal 1")
    })
})


describe("roundNameOf", () => {
    it("maps a round id to its name", () => {
        expect(roundNameOf(ROUNDS, "khoi-dong")).toBe("Khởi động")
    })

    it("falls back to the raw id for a round the tournament does not list", () => {
        expect(roundNameOf(ROUNDS, "mystery-round")).toBe("mystery-round")
    })
})


describe("toStandings — the places model", () => {
    it("maps the wire's row onto the view's row", () => {
        const [row] = toStandings([
            {
                userId: "11111111-1111-1111-1111-111111111111",
                displayName: "A. Voss",
                place: 1,
                matchesPlayed: 3,
                placementPoints: 25,
                stageId: "playoffs",
                stageTitle: "Vòng Playoffs",
                slot: 1,
            },
        ])

        expect(row).toEqual({
            id: "11111111-1111-1111-1111-111111111111",
            rank: 1,
            name: "A. Voss",
            stageTitle: "Vòng Playoffs",
            matchesPlayed: 3,
            points: 25,
        })
    })

    it("keeps a player who never played at the bottom, with no place", () => {
        const [row] = toStandings([
            {
                userId: "33333333-3333-3333-3333-333333333333",
                displayName: "Never Seated",
                place: null,
                matchesPlayed: 0,
                placementPoints: 0,
                stageId: null,
                stageTitle: null,
                slot: null,
            },
        ])

        expect(row).toMatchObject({ rank: null, points: 0, matchesPlayed: 0, stageTitle: null })
    })
})
