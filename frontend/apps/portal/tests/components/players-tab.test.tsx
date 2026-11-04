import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { PlayersTab } from "@/components/players-tab"
import { renderWithProviders } from "../helpers/render"

// Thí sinh — the roster, and the only place a contestant is created or corrected.
// It lists and nothing else: name, the account it belongs to (or "chưa có"), and the
// three actions. Group membership belongs to the Groups tab; scores to Standings.
//
// The dialog has two doors: enroll an account the player registered themselves
// (by address — the operator never sees a password), or create a show-floor
// identity (name + optional email).

const TOURNAMENT = "t1"
const ROSTER_URL = `GET /portal/tournaments/${TOURNAMENT}/players`
const CREATE_URL = `POST /portal/tournaments/${TOURNAMENT}/players/new`
const ENROLL_URL = `POST /portal/tournaments/${TOURNAMENT}/players/by-email`
const EDIT_URL = (userId: string) => `PATCH /portal/tournaments/${TOURNAMENT}/players/${userId}`
const REMOVE_URL = (userId: string) => `DELETE /portal/tournaments/${TOURNAMENT}/players/${userId}`

const row = (userId: string, displayName: string, email: string | null = null, group: "A" | "B" | null = null) => ({
    userId,
    displayName,
    email,
    group,
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

    it("counts how many have an account and how many are show-floor only", async () => {
        draw()
        expect(await screen.findByText(/2 contestants · 1 with an account, 1 show-floor only/)).toBeInTheDocument()
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

    /** The show-floor door (name + optional email) — the dialog's second tab. */
    const openCreateTab = async () => {
        await userEvent.click(await screen.findByRole("tab", { name: /Tạo danh tính tại chỗ/ }))
    }

    it("does not put a form in the header: the roster card offers a button", async () => {
        draw()
        await screen.findByText("An")
        expect(screen.queryByLabelText("Tên")).toBeNull()
        expect(screen.getByRole("button", { name: /Thêm thí sinh/ })).toBeInTheDocument()
    })

    it("opens on enroll-by-email: the address, and why the player must have registered", async () => {
        draw()
        await openDialog()
        expect(screen.getByLabelText(/Email của thí sinh/)).toBeInTheDocument()
        // the email's consequence is stated where the decision is made
        expect(screen.getByText(/không biết và không cần mật khẩu/)).toBeInTheDocument()
    })

    it("offers a show-floor identity beside it, with the reason for its email", async () => {
        draw()
        await openDialog()
        await openCreateTab()
        expect(screen.getByLabelText(/^Tên$/)).toBeInTheDocument()
        expect(screen.getByLabelText(/Email \(không bắt buộc\)/)).toBeInTheDocument()
        expect(screen.getByText(/giữ được lịch sử/)).toBeInTheDocument()
    })

    it("closes on Huỷ without sending anything", async () => {
        const { fetchMock } = draw()
        await openDialog()
        await userEvent.click(screen.getByRole("button", { name: "Huỷ" }))
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
        expect(callOf(fetchMock!, CREATE_URL)).toBeUndefined()
        expect(callOf(fetchMock!, ENROLL_URL)).toBeUndefined()
    })

    it("enrolls an address with no password in sight — the whole point", async () => {
        const { fetchMock } = draw({
            [ENROLL_URL]: { body: { userId: "u7", displayName: "Em", email: "em@example.test", group: null } },
        })

        await openDialog()
        await userEvent.type(screen.getByLabelText(/Email của thí sinh/), "em@example.test")
        await userEvent.click(screen.getByRole("button", { name: /^Ghi danh$/ }))

        await waitFor(() => expect(callOf(fetchMock!, ENROLL_URL)).toBeTruthy())
        expect(JSON.parse(String(callOf(fetchMock!, ENROLL_URL)![1]?.body))).toEqual({ email: "em@example.test" })
        // and it closes itself on success
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    })

    it("keeps the server's refusal in the dialog, next to what caused it", async () => {
        draw({
            [ENROLL_URL]: {
                body: { message: "no contestant has registered with x@example.test yet — ask them to register first" },
                status: 404,
            },
        })

        await openDialog()
        await userEvent.type(screen.getByLabelText(/Email của thí sinh/), "x@example.test")
        await userEvent.click(screen.getByRole("button", { name: /^Ghi danh$/ }))

        expect(await screen.findByRole("alert")).toHaveTextContent(/ask them to register first/)
        expect(screen.getByRole("dialog")).toBeInTheDocument()
    })

    it("sends the name alone when no email is given", async () => {
        const { fetchMock } = draw({ [CREATE_URL]: { body: { userId: "u9", displayName: "Em", group: null } } })

        await openDialog()
        await openCreateTab()
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
        await openCreateTab()
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
        await openCreateTab()
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

describe("the group a contestant banks for", () => {
    it("shows Nhóm A / Nhóm B in its own column", async () => {
        draw({}, [row("u1", "An", null, "A"), row("u2", "Bình", "binh@example.test", "B")])
        await screen.findByText("An")

        expect(screen.getByText("Nhóm")).toBeInTheDocument()
        expect(screen.getByText("Nhóm A")).toBeInTheDocument()
        expect(screen.getByText("Nhóm B")).toBeInTheDocument()
    })

    it("says chưa xếp for a contestant still waiting for the draw", async () => {
        draw({}, [row("u1", "An")])
        await screen.findByText("An")
        expect(screen.getByText("chưa xếp")).toBeInTheDocument()
    })
})

// ── step 7: the desk's two account actions ──────────────────────────────────
//
// «Xác thực» is the operator vouching for an address (SMTP stays optional on
// the floor); «Mã vào» is the forgotten-password path — a one-time code bound
// to THIS player, shown once, because the desk must never hold a password.

const VERIFY_URL = (userId: string) => `POST /portal/tournaments/${TOURNAMENT}/players/${userId}/verify`
const ENTRY_URL = (userId: string) => `POST /portal/tournaments/${TOURNAMENT}/players/${userId}/entry-code`

const accountRow = (
    userId: string,
    displayName: string,
    email: string,
    emailVerified: boolean
) => ({ ...row(userId, displayName, email), emailVerified })

describe("the desk's account actions", () => {
    it("offers «Xác thực» only for an account that has not opened its mail link", async () => {
        draw({}, [
            accountRow("u9", "Chi", "chi@example.test", false),
            accountRow("u10", "Dũng", "dung@example.test", true),
        ])

        await screen.findByText("Chi")
        // one unverified account → exactly one button; the verified row is done
        expect(screen.getAllByRole("button", { name: /Xác thực/ })).toHaveLength(1)
        expect(screen.getByText("dung@example.test")).toBeInTheDocument()
    })

    it("activates the account in one click — the operator never touches a password", async () => {
        const { fetchMock } = draw(
            { [VERIFY_URL("u9")]: { body: { userId: "u9", email: "chi@example.test", emailVerified: true } } },
            [accountRow("u9", "Chi", "chi@example.test", false)]
        )

        await screen.findByText("Chi")
        await userEvent.click(screen.getByRole("button", { name: /Xác thực/ }))

        await waitFor(() => expect(callOf(fetchMock!, VERIFY_URL("u9"))).toBeTruthy())
        // POST with no body: the address is already on the row
        expect(callOf(fetchMock!, VERIFY_URL("u9"))![1]?.body).toBeUndefined()
    })

    it("hands out a one-time entry code and shows it once, with its clock", async () => {
        const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString()
        const { fetchMock } = draw(
            { [ENTRY_URL("u9")]: { body: { userId: "u9", email: "chi@example.test", code: "ABC234", expiresAt } } },
            [accountRow("u9", "Chi", "chi@example.test", true)]
        )

        await screen.findByText("Chi")
        await userEvent.click(screen.getByRole("button", { name: /Mã vào/ }))

        const banner = await screen.findByRole("status")
        expect(banner).toHaveTextContent(/Mã vào cho/)
        expect(banner).toHaveTextContent("ABC234")
        expect(banner).toHaveTextContent(/dùng một lần/)
        expect(banner).toHaveTextContent(/15 phút/)
        expect(callOf(fetchMock!, ENTRY_URL("u9"))).toBeTruthy()

        // …and it can be put away: the code is not pinned to the screen
        await userEvent.click(screen.getByRole("button", { name: "Đóng" }))
        await waitFor(() => expect(screen.queryByRole("status")).toBeNull())
    })

    it("offers no account actions for a show-floor identity", async () => {
        draw({}, [row("u1", "An")])

        await screen.findByText("An")
        expect(screen.queryByRole("button", { name: /Xác thực/ })).toBeNull()
        expect(screen.queryByRole("button", { name: /Mã vào/ })).toBeNull()
    })

    it("keeps the server's refusal on the tab", async () => {
        draw(
            { [VERIFY_URL("u9")]: { body: { message: "chi@example.test belongs to a disabled account" }, status: 403 } },
            [accountRow("u9", "Chi", "chi@example.test", false)]
        )

        await screen.findByText("Chi")
        await userEvent.click(screen.getByRole("button", { name: /Xác thực/ }))

        expect(await screen.findByRole("alert")).toHaveTextContent(/disabled account/)
    })
})
