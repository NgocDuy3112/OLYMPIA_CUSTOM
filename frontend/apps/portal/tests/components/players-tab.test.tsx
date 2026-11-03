import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { PlayersTab } from "@/components/players-tab"
import { renderWithProviders } from "../helpers/render"

// Thí sinh — the roster, and the only place a contestant is created or corrected.
// It lists and nothing else: name, the account it belongs to (or "chưa có"), and the
// three actions. Group membership belongs to the Groups tab; scores to Standings.
//
// The email is the load-bearing field: without one the contestant is a show-floor
// identity (plays by PIN, keeps no history), with one their own Google sign-in
// attaches to this row later.

const TOURNAMENT = "t1"
const ROSTER_URL = `GET /portal/tournaments/${TOURNAMENT}/players`
const CREATE_URL = `POST /portal/tournaments/${TOURNAMENT}/players/new`
const EDIT_URL = (userId: string) => `PATCH /portal/tournaments/${TOURNAMENT}/players/${userId}`
const REMOVE_URL = (userId: string) => `DELETE /portal/tournaments/${TOURNAMENT}/players/${userId}`

const row = (userId: string, displayName: string, email: string | null = null) => ({
    userId,
    displayName,
    email,
    group: null,
    enrolledAt: "2026-11-03T00:00:00.000Z",
})

const roster = (items: ReturnType<typeof row>[]) => ({ items })

/** The stub keys carry the method ("POST /path"); a mock call records them apart. */
const callKey = (call: [RequestInfo | URL, RequestInit?]) =>
    `${call[1]?.method ?? "GET"} ${String(call[0])}`

const callOf = (fetchMock: ReturnType<typeof renderWithProviders>["fetchMock"], key: string) =>
    fetchMock?.mock.calls.find((call) => callKey(call) === key)

const draw = (routes: Record<string, { body: unknown; status?: number }> = {}, items = [row("u1", "An"), row("u2", "Bình", "binh@example.test")]) =>
    renderWithProviders(<PlayersTab tournamentId={TOURNAMENT} frozen={false} />, {
        routes: { [ROSTER_URL]: { body: roster(items) }, ...routes },
    })

describe("the roster list", () => {
    it("shows a name and the account it belongs to", async () => {
        draw()
        expect(await screen.findByText("An")).toBeInTheDocument()
        expect(screen.getByText("binh@example.test")).toBeInTheDocument()
    })

    it("says a contestant has no account, rather than showing a placeholder email", async () => {
        draw()
        await screen.findByText("An")
        // the server answers `email: null` for a @players.invalid identity
        expect(screen.getByText("chưa có tài khoản")).toBeInTheDocument()
    })

    it("counts how many can sign in and how many only play by PIN", async () => {
        draw()
        expect(await screen.findByText(/2 contestants · 1 with an account, 1 playing only through the PIN/)).toBeInTheDocument()
    })

    it("points at the right first step when the roster is empty", async () => {
        draw({}, [])
        expect(await screen.findByText(/No contestants yet/)).toBeInTheDocument()
        expect(screen.getByText(/A match seats players from this roster/)).toBeInTheDocument()
    })
})

describe("adding a contestant — in a dialog, like every other create here", () => {
    const openDialog = async () => {
        await userEvent.click(await screen.findByRole("button", { name: /Thêm thí sinh/ }))
        return screen.findByRole("dialog")
    }

    it("does not put a form in the header: the roster card offers a button", async () => {
        draw()
        await screen.findByText("An")
        expect(screen.queryByLabelText("Tên")).toBeNull()
        expect(screen.getByRole("button", { name: /Thêm thí sinh/ })).toBeInTheDocument()
    })

    it("opens a dialog with a name, an optional email, and the reason for it", async () => {
        draw()
        await openDialog()
        expect(screen.getByLabelText(/^Tên$/)).toBeInTheDocument()
        expect(screen.getByLabelText(/Email \(không bắt buộc\)/)).toBeInTheDocument()
        // the email's consequence is stated where the decision is made
        expect(screen.getByText(/giữ được lịch sử/)).toBeInTheDocument()
    })

    it("closes on Huỷ without sending anything", async () => {
        const { fetchMock } = draw()
        await openDialog()
        await userEvent.click(screen.getByRole("button", { name: "Huỷ" }))
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
        expect(callOf(fetchMock!, CREATE_URL)).toBeUndefined()
    })

    it("sends the name alone when no email is given", async () => {
        const { fetchMock } = draw({ [CREATE_URL]: { body: { userId: "u9", displayName: "Em", group: null } } })

        await openDialog()
        await userEvent.type(screen.getByLabelText(/^Tên$/), "  Em  ")
        await userEvent.click(screen.getByRole("button", { name: /^Thêm$/ }))

        await waitFor(() => expect(callOf(fetchMock!, CREATE_URL)).toBeTruthy())
        expect(JSON.parse(String(callOf(fetchMock!, CREATE_URL)![1]?.body))).toEqual({ displayName: "Em" })
        // and it closes itself on success
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    })

    it("sends the address when given — that is what keeps their history", async () => {
        const { fetchMock } = draw({ [CREATE_URL]: { body: { userId: "u9", displayName: "Em", group: null } } })

        await openDialog()
        await userEvent.type(screen.getByLabelText(/^Tên$/), "Em")
        await userEvent.type(screen.getByLabelText(/Email/), "em@example.test")
        await userEvent.click(screen.getByRole("button", { name: /^Thêm$/ }))

        await waitFor(() => expect(callOf(fetchMock!, CREATE_URL)).toBeTruthy())
        expect(JSON.parse(String(callOf(fetchMock!, CREATE_URL)![1]?.body))).toEqual({
            displayName: "Em",
            email: "em@example.test",
        })
    })

    it("reports a refusal instead of pretending it worked", async () => {
        draw({ [CREATE_URL]: { body: { message: '"An" is already a contestant in this tournament' }, status: 409 } })

        await openDialog()
        await userEvent.type(screen.getByLabelText(/^Tên$/), "An")
        await userEvent.click(screen.getByRole("button", { name: /^Thêm$/ }))

        // the refusal stays in the dialog, next to what caused it
        expect(await screen.findByRole("alert")).toHaveTextContent(/already a contestant/)
        expect(screen.getByRole("dialog")).toBeInTheDocument()
    })
})

describe("editing a contestant", () => {
    it("opens with the current name and address", async () => {
        draw()
        await screen.findByText("Bình")
        await userEvent.click(screen.getAllByRole("button", { name: /Sửa/ })[1]!)

        expect((screen.getByLabelText("Edit contestant name") as HTMLInputElement).value).toBe("Bình")
        expect((screen.getByLabelText("Edit contestant email") as HTMLInputElement).value).toBe("binh@example.test")
    })

    it("patches the name and the address together", async () => {
        const { fetchMock } = draw({ [EDIT_URL("u1")]: { body: { userId: "u1", displayName: "An Bùi", email: "an@example.test" } } })

        await screen.findByText("An")
        await userEvent.click(screen.getAllByRole("button", { name: /Sửa/ })[0]!)

        const name = screen.getByLabelText("Edit contestant name")
        await userEvent.clear(name)
        await userEvent.type(name, "An Bùi")
        await userEvent.type(screen.getByLabelText("Edit contestant email"), "an@example.test")
        await userEvent.click(screen.getByRole("button", { name: "Lưu" }))

        await waitFor(() => expect(callOf(fetchMock!, EDIT_URL("u1"))).toBeTruthy())
        expect(JSON.parse(String(callOf(fetchMock!, EDIT_URL("u1"))![1]?.body))).toEqual({
            displayName: "An Bùi",
            email: "an@example.test",
        })
    })

    it("detaches the address when the field is emptied", async () => {
        const { fetchMock } = draw({ [EDIT_URL("u2")]: { body: { userId: "u2", displayName: "Bình", email: null } } })

        await screen.findByText("Bình")
        await userEvent.click(screen.getAllByRole("button", { name: /Sửa/ })[1]!)
        await userEvent.clear(screen.getByLabelText("Edit contestant email"))
        await userEvent.click(screen.getByRole("button", { name: "Lưu" }))

        await waitFor(() => expect(callOf(fetchMock!, EDIT_URL("u2"))).toBeTruthy())
        // null, not "": back to a show-floor identity
        expect(JSON.parse(String(callOf(fetchMock!, EDIT_URL("u2"))![1]?.body))).toEqual({
            displayName: "Bình",
            email: null,
        })
    })

    it("reports why the server refused the change", async () => {
        draw({
            [EDIT_URL("u1")]: { body: { message: "an@example.test already belongs to An Bùi — enroll that account instead" }, status: 409 },
        })
        await screen.findByText("An")
        await userEvent.click(screen.getAllByRole("button", { name: /Sửa/ })[0]!)
        await userEvent.type(screen.getByLabelText("Edit contestant email"), "an@example.test")
        await userEvent.click(screen.getByRole("button", { name: "Lưu" }))

        expect(await screen.findByRole("alert")).toHaveTextContent(/already belongs to/)
    })
})

describe("taking someone off the roster", () => {
    it("asks the server, which refuses if they have played", async () => {
        const { fetchMock } = draw({
            [REMOVE_URL("u1")]: { body: { message: "this contestant has played in this tournament — their results are on the record" }, status: 409 },
        })

        await screen.findByText("An")
        await userEvent.click(screen.getAllByRole("button", { name: /Bỏ/ })[0]!)

        await waitFor(() => expect(callOf(fetchMock!, REMOVE_URL("u1"))).toBeTruthy())
        expect(await screen.findByRole("alert")).toHaveTextContent(/results are on the record/)
    })

    it("deletes the enrollment when the server allows it", async () => {
        const { fetchMock } = draw({ [REMOVE_URL("u1")]: { body: { removed: "u1" } } })

        await screen.findByText("An")
        await userEvent.click(screen.getAllByRole("button", { name: /Bỏ/ })[0]!)

        await waitFor(() => expect(callOf(fetchMock!, REMOVE_URL("u1"))).toBeTruthy())
        expect(callOf(fetchMock!, REMOVE_URL("u1"))![1]?.method).toBe("DELETE")
    })
})
