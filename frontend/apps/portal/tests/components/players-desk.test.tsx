import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { PlayersDesk } from "@/components/players-desk"
import { renderWithProviders } from "../helpers/render"


const PLAYERS_URL = "GET /portal/players"
const TOURNAMENTS_URL = "GET /portal/tournaments?limit=100&offset=0"

const tournaments = [
    { id: "t1", name: "Spring Cup", current: true, closedAt: null },
    { id: "t2", name: "Autumn Cup", current: false, closedAt: null },
]

const enrollment = (id: string, name: string, current = false) => ({
    tournamentId: id,
    name,
    current,
    closed: false,
})

const player = (
    userId: string,
    displayName: string,
    over: Partial<{
        username: string
        email: string | null
        discordId: string | null
        enrollments: ReturnType<typeof enrollment>[]
    }> = {}
) => ({
    userId,
    displayName,
    username: displayName.toLowerCase().replace(/\s+/g, "-"),
    email: null as string | null,
    discordId: null as string | null,
    enrollments: [] as ReturnType<typeof enrollment>[],
    ...over,
})

const callKey = (call: [RequestInfo | URL, RequestInit?]) =>
    `${call[1]?.method ?? "GET"} ${String(call[0])}`

const callOf = (fetchMock: ReturnType<typeof renderWithProviders>["fetchMock"], key: string) =>
    fetchMock?.mock.calls.find((call) => callKey(call) === key)

const draw = (
    routes: Record<string, { body: unknown; status?: number }> = {},
    items = [
        player("u1", "Dị Ngọc", { email: "ngoc@example.test", enrollments: [enrollment("t1", "Spring Cup", true)] }),
        player("u2", "Minh Anh"),
    ]
) =>
    renderWithProviders(<PlayersDesk />, {
        routes: {
            [PLAYERS_URL]: { body: { items } },
            [TOURNAMENTS_URL]: { body: { items: tournaments, total: tournaments.length, limit: 100, offset: 0 } },
            ...routes,
        },
    })

describe("the global player list", () => {
    it("shows every account, and which tournaments each one is in", async () => {
        draw()
        expect(await screen.findByText("Dị Ngọc")).toBeInTheDocument()
        expect(screen.getByText("Minh Anh")).toBeInTheDocument()
        expect(screen.getByText("Spring Cup · current")).toBeInTheDocument()
        expect(screen.getByText("chưa ghi danh giải nào")).toBeInTheDocument()
    })

    it("counts accounts against enrollments, and credits Google for the arrivals", async () => {
        draw()
        expect(await screen.findByText(/2 tài khoản · 1 ghi danh ít nhất một giải/)).toBeInTheDocument()
        expect(screen.getByText(/đăng nhập Google/)).toBeInTheDocument()
    })

    it("has NO password anywhere — that door belongs to Google now", async () => {
        draw()
        await screen.findByText("Dị Ngọc")
        expect(screen.queryByRole("button", { name: /Đặt mật khẩu/ })).toBeNull()
        expect(screen.queryByText(/mật khẩu/)).toBeNull()
        expect(screen.queryByLabelText(/New password/)).toBeNull()
    })

    it("says the list fills itself when nobody has signed in yet", async () => {
        draw({}, [])
        expect(await screen.findByText(/Chưa có tài khoản nào/)).toBeInTheDocument()
        expect(screen.getByText(/không cần tạo tài khoản ở đây/)).toBeInTheDocument()
    })
})

describe("assigning a tournament — the row's Ghi danh", () => {
    it("offers only the tournaments the player is missing", async () => {
        draw()
        await screen.findByText("Minh Anh")
        await userEvent.click(screen.getAllByRole("button", { name: /Ghi danh/ })[1]!)

        const select = screen.getByLabelText("Giải") as HTMLSelectElement
        expect(Array.from(select.options).map((option) => option.value)).toEqual(["t1", "t2"])
    })

    it("enrolls the player into the picked tournament", async () => {
        const { fetchMock } = draw({
            "POST /portal/tournaments/t2/players": { body: { enrolled: 1 } },
        })

        await screen.findByText("Minh Anh")
        await userEvent.click(screen.getAllByRole("button", { name: /Ghi danh/ })[1]!)
        await userEvent.selectOptions(screen.getByLabelText("Giải"), "t2")
        await userEvent.click(screen.getByRole("button", { name: /^Ghi danh$/ }))

        await waitFor(() => expect(callOf(fetchMock!, "POST /portal/tournaments/t2/players")).toBeTruthy())
        expect(
            JSON.parse(String(callOf(fetchMock!, "POST /portal/tournaments/t2/players")![1]?.body))
        ).toEqual({ userIds: ["u2"] })
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    })

    it("grays the button out when there is no tournament left to join", async () => {
        draw({}, [
            player("u1", "Dị Ngọc", {
                enrollments: [enrollment("t1", "Spring Cup", true), enrollment("t2", "Autumn Cup")],
            }),
        ])
        await screen.findByText("Dị Ngọc")

        expect(screen.getAllByRole("button", { name: /Ghi danh/ })[0]).toBeDisabled()
    })
})

describe("leaving a tournament — the row's Bỏ", () => {
    it("asks WHICH tournament when the player is in several", async () => {
        draw({}, [
            player("u1", "Dị Ngọc", {
                enrollments: [enrollment("t1", "Spring Cup", true), enrollment("t2", "Autumn Cup")],
            }),
        ])
        await screen.findByText("Dị Ngọc")

        await userEvent.click(screen.getAllByRole("button", { name: /^Bỏ$/ })[0]!)
        const select = screen.getByLabelText("Giải") as HTMLSelectElement
        expect(Array.from(select.options).map((option) => option.value)).toEqual(["t1", "t2"])
    })

    it("deletes the membership it was asked for", async () => {
        const { fetchMock } = draw({
            "DELETE /portal/tournaments/t1/players/u1": { body: { removed: "u1" } },
        }, [player("u1", "Dị Ngọc", { enrollments: [enrollment("t1", "Spring Cup", true)] })])

        await screen.findByText("Dị Ngọc")
        await userEvent.click(screen.getAllByRole("button", { name: /^Bỏ$/ })[0]!)
        await userEvent.click(screen.getByRole("button", { name: /^Bỏ$/ }))

        await waitFor(() => expect(callOf(fetchMock!, "DELETE /portal/tournaments/t1/players/u1")).toBeTruthy())
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    })

    it("keeps the server's refusal on the dialog", async () => {
        draw({
            "DELETE /portal/tournaments/t1/players/u1": {
                body: { message: "this contestant has played in this tournament — their results are on the record" },
                status: 409,
            },
        }, [player("u1", "Dị Ngọc", { enrollments: [enrollment("t1", "Spring Cup", true)] })])

        await screen.findByText("Dị Ngọc")
        await userEvent.click(screen.getAllByRole("button", { name: /^Bỏ$/ })[0]!)
        await userEvent.click(screen.getByRole("button", { name: /^Bỏ$/ }))

        expect(await screen.findByRole("alert")).toHaveTextContent(/results are on the record/)
        expect(screen.getByRole("dialog")).toBeInTheDocument()
    })

    it("has nothing to remove for a player in no tournament", async () => {
        draw()
        await screen.findByText("Minh Anh")
        expect(screen.getAllByRole("button", { name: /^Bỏ$/ })[1]).toBeDisabled()
    })
})

describe("editing an account — no tournament in the URL", () => {
    it("opens Sửa as a POPUP over the table, never a panel under it", async () => {
        draw()
        await screen.findByText("Dị Ngọc")
        await userEvent.click(screen.getAllByRole("button", { name: /Sửa/ })[0]!)

        const dialog = screen.getByRole("dialog")
        expect(within(dialog).getByLabelText("Edit player name")).toHaveValue("Dị Ngọc")
        expect(within(dialog).getByRole("button", { name: "Lưu" })).toBeInTheDocument()
        // the table row is still the only copy of the name — no inline echo below it
        expect(screen.getAllByText("Dị Ngọc")).toHaveLength(1)
    })

    it("opens with the current name and address", async () => {
        draw()
        await screen.findByText("Dị Ngọc")
        await userEvent.click(screen.getAllByRole("button", { name: /Sửa/ })[0]!)

        expect((screen.getByLabelText("Edit player name") as HTMLInputElement).value).toBe("Dị Ngọc")
        expect((screen.getByLabelText("Edit player email") as HTMLInputElement).value).toBe("ngoc@example.test")
    })

    it("patches the account itself", async () => {
        const { fetchMock } = draw({
            "PATCH /portal/players/u2": { body: { userId: "u2", displayName: "Minh Anh Le", email: "minh@example.test" } },
        })

        await screen.findByText("Minh Anh")
        await userEvent.click(screen.getAllByRole("button", { name: /Sửa/ })[1]!)

        const name = screen.getByLabelText("Edit player name")
        await userEvent.clear(name)
        await userEvent.type(name, "Minh Anh Le")
        await userEvent.type(screen.getByLabelText("Edit player email"), "minh@example.test")
        await userEvent.click(screen.getByRole("button", { name: "Lưu" }))

        await waitFor(() => expect(callOf(fetchMock!, "PATCH /portal/players/u2")).toBeTruthy())
        expect(JSON.parse(String(callOf(fetchMock!, "PATCH /portal/players/u2")![1]?.body))).toEqual({
            displayName: "Minh Anh Le",
            email: "minh@example.test",
        })
        await waitFor(() => expect(screen.queryByLabelText("Edit player name")).toBeNull())
    })

    it("reports why the server refused the change", async () => {
        draw({
            "PATCH /portal/players/u1": {
                body: { message: "that address already belongs to An Bùi — that address links one Google account only" },
                status: 409,
            },
        })

        await screen.findByText("Dị Ngọc")
        await userEvent.click(screen.getAllByRole("button", { name: /Sửa/ })[0]!)
        await userEvent.clear(screen.getByLabelText("Edit player email"))
        await userEvent.type(screen.getByLabelText("Edit player email"), "an@example.test")
        await userEvent.click(screen.getByRole("button", { name: "Lưu" }))

        expect(await screen.findByRole("alert")).toHaveTextContent(/already belongs to/)
    })

    it("refuses a Discord field that is not an ID", async () => {
        draw()
        await screen.findByText("Dị Ngọc")
        await userEvent.click(screen.getAllByRole("button", { name: /Sửa/ })[0]!)
        await userEvent.type(screen.getByLabelText("Discord ID"), "123")

        expect(screen.getByText(/ID Discord là dãy/)).toBeInTheDocument()
        expect(screen.getByRole("button", { name: "Lưu" })).toBeDisabled()
    })
})
