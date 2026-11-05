import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { PlayersTab } from "@/components/players-tab"
import { renderWithProviders } from "../helpers/render"

// Thí sinh — the roster, and the only place a contestant is created or corrected.
// It lists and nothing else: name, the ACCOUNT (handle, address, password state),
// and three actions. Group membership belongs to the Groups tab; scores to Standings.
//
// The dialog has two doors, in the order step 8 made them matter: CREATE the
// account (name + the desk's first password — the handle is derived from the
// name), or enroll an account that already exists by its address (Google-made,
// or created for another tournament — no password in sight either way).

const TOURNAMENT = "t1"
const ROSTER_URL = `GET /portal/tournaments/${TOURNAMENT}/players`
const CREATE_URL = `POST /portal/tournaments/${TOURNAMENT}/players/new`
const ENROLL_URL = `POST /portal/tournaments/${TOURNAMENT}/players/by-email`
const EDIT_URL = (userId: string) => `PATCH /portal/tournaments/${TOURNAMENT}/players/${userId}`
const REMOVE_URL = (userId: string) => `DELETE /portal/tournaments/${TOURNAMENT}/players/${userId}`

const row = (
    userId: string,
    displayName: string,
    email: string | null = null,
    group: "A" | "B" | null = null,
    over: Partial<{ username: string; hasPassword: boolean; mustChangePassword: boolean }> = {}
) => ({
    userId,
    displayName,
    // the handle the server would derive: the address's local part, else the name
    username: email ? email.split("@")[0]! : displayName.toLowerCase().replace(/\s+/g, "-"),
    email,
    hasPassword: true,
    mustChangePassword: false,
    group,
    enrolledAt: "2026-11-03T00:00:00.000Z",
    ...over,
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

    it("shows the handle they sign in with, and says when there is no address", async () => {
        draw()
        await screen.findByText("An")
        // the handle is the identity since step 8 — it is on the row even when
        // no address ever was (a @players.invalid placeholder is history)
        expect(screen.getByText("an")).toBeInTheDocument()
        expect(screen.getByText("không có địa chỉ")).toBeInTheDocument()
        expect(screen.getByText("binh")).toBeInTheDocument()
    })

    it("counts who has a password and who does not", async () => {
        draw({}, [
            row("u1", "Chưa Có", null, null, { hasPassword: false }),
            row("u2", "Bình", "binh@example.test"),
        ])
        expect(await screen.findByText(/2 contestants · 1 có mật khẩu, 1 chưa có/)).toBeInTheDocument()
    })

    it("flags the rows still on the desk's first password", async () => {
        draw({}, [row("u1", "Chưa Đổi", "chua@example.test", null, { mustChangePassword: true })])
        expect(await screen.findByText("chưa đổi mật khẩu")).toBeInTheDocument()
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

    /** The OTHER door: an account that already exists, by its address. */
    const openEnrollTab = async () => {
        await userEvent.click(await screen.findByRole("tab", { name: /Ghi danh theo email/ }))
    }

    /** Fill the create tab: name + the desk's first password (+ optional address). */
    const fillCreate = async (name: string, password = "mat-khau-ban-2026", email?: string) => {
        await userEvent.type(screen.getByLabelText(/^Tên \(trên bảng đấu\)$/), name)
        await userEvent.type(screen.getByLabelText(/Mật khẩu ban điều hành cấp/), password)
        if (email) await userEvent.type(screen.getByLabelText(/Email \(không bắt buộc\)/), email)
    }

    it("does not put a form in the header: the roster card offers a button", async () => {
        draw()
        await screen.findByText("An")
        expect(screen.queryByLabelText("Tên")).toBeNull()
        expect(screen.getByRole("button", { name: /Thêm thí sinh/ })).toBeInTheDocument()
    })

    it("opens on CREATE: the name, the desk's first password, and the handle preview", async () => {
        draw()
        await openDialog()
        expect(screen.getByLabelText(/^Tên \(trên bảng đấu\)$/)).toBeInTheDocument()
        expect(screen.getByLabelText(/Mật khẩu ban điều hành cấp/)).toBeInTheDocument()
        // the handle is derived, and the desk is told so BEFORE it creates
        expect(screen.getByText(/Ngọc Duy/)).toBeInTheDocument()

        await userEvent.type(screen.getByLabelText(/^Tên \(trên bảng đấu\)$/), "Ngọc Duy")
        expect(screen.getByText("ngoc-duy")).toBeInTheDocument()
    })

    it("offers enroll-by-email beside it, for an account that already exists", async () => {
        draw()
        await openDialog()
        await openEnrollTab()
        expect(screen.getByLabelText(/Email của thí sinh/)).toBeInTheDocument()
        // the consequence is stated where the decision is made: this door never
        // sees a password, because the account already has one of its own
        expect(screen.getByText(/không biết và không cần mật khẩu/)).toBeInTheDocument()
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
        await openEnrollTab()
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
                body: { message: "no account exists for x@example.test yet — have the desk create them" },
                status: 404,
            },
        })

        await openDialog()
        await openEnrollTab()
        await userEvent.type(screen.getByLabelText(/Email của thí sinh/), "x@example.test")
        await userEvent.click(screen.getByRole("button", { name: /^Ghi danh$/ }))

        expect(await screen.findByRole("alert")).toHaveTextContent(/no account exists for/)
        expect(screen.getByRole("dialog")).toBeInTheDocument()
    })

    it("creates the account with the desk's first password — and no address", async () => {
        const { fetchMock } = draw({ [CREATE_URL]: { body: { userId: "u9", displayName: "Em", username: "em", group: null } } })

        await openDialog()
        await userEvent.type(screen.getByLabelText(/^Tên \(trên bảng đấu\)$/), "  Em  ")

        // a password shorter than the floor keeps the button disabled
        expect(screen.getByRole("button", { name: /^Tạo tài khoản$/ })).toBeDisabled()
        await userEvent.type(screen.getByLabelText(/Mật khẩu ban điều hành cấp/), "mat-khau-ban-2026")
        await userEvent.click(screen.getByRole("button", { name: /^Tạo tài khoản$/ }))

        await waitFor(() => expect(callOf(fetchMock!, CREATE_URL)).toBeTruthy())
        expect(JSON.parse(String(callOf(fetchMock!, CREATE_URL)![1]?.body))).toEqual({
            displayName: "Em",
            password: "mat-khau-ban-2026",
        })
        // and it closes itself on success
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    })

    it("sends the address when given — that is what keeps their history with Google", async () => {
        const { fetchMock } = draw({ [CREATE_URL]: { body: { userId: "u9", displayName: "Em", username: "em", group: null } } })

        await openDialog()
        await fillCreate("Em", "mat-khau-ban-2026", "em@example.test")
        await userEvent.click(screen.getByRole("button", { name: /^Tạo tài khoản$/ }))

        await waitFor(() => expect(callOf(fetchMock!, CREATE_URL)).toBeTruthy())
        expect(JSON.parse(String(callOf(fetchMock!, CREATE_URL)![1]?.body))).toEqual({
            displayName: "Em",
            password: "mat-khau-ban-2026",
            email: "em@example.test",
        })
    })

    it("reports a refusal instead of pretending it worked", async () => {
        draw({ [CREATE_URL]: { body: { message: '"An" is already a contestant in this tournament' }, status: 409 } })

        await openDialog()
        await fillCreate("An")
        await userEvent.click(screen.getByRole("button", { name: /^Tạo tài khoản$/ }))

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

// ── step 8: the desk's password actions ──────────────────────────────────
//
// The desk types a FIRST password (at create, or with this reset) and it stops
// being the desk's at the player's next sign-in — the BACKEND gate enforces
// that, and the roster's job is to show which state each row is in and to hand
// over the one button that fixes a forgotten password.

const RESET_URL = (userId: string) => `POST /portal/tournaments/${TOURNAMENT}/players/${userId}/password`

describe("resetting a password from the roster", () => {
    it("keeps the panel closed until asked, then names the player it is for", async () => {
        draw({}, [row("u9", "Chi", "chi@example.test", null, { mustChangePassword: true })])
        await screen.findByText("Chi")
        expect(screen.queryByLabelText("New password")).toBeNull()

        await userEvent.click(screen.getByRole("button", { name: /Đặt mật khẩu/ }))
        expect(screen.getByText(/Mật khẩu đầu cho Chi/)).toBeInTheDocument()
        // nothing under 8 characters counts as a password yet
        expect(screen.getByRole("button", { name: /^Cấp lại$/ })).toBeDisabled()
    })

    it("sends the typed password — the only secret that ever exists at this desk", async () => {
        const { fetchMock } = draw(
            { [RESET_URL("u9")]: { body: { userId: "u9", username: "chi" } } },
            [row("u9", "Chi", "chi@example.test")]
        )

        await screen.findByText("Chi")
        await userEvent.click(screen.getByRole("button", { name: /Đặt mật khẩu/ }))
        await userEvent.type(screen.getByLabelText("New password"), "mat-khau-moi-1")
        await userEvent.click(screen.getByRole("button", { name: /^Cấp lại$/ }))

        await waitFor(() => expect(callOf(fetchMock!, RESET_URL("u9"))).toBeTruthy())
        expect(JSON.parse(String(callOf(fetchMock!, RESET_URL("u9"))![1]?.body))).toEqual({
            password: "mat-khau-moi-1",
        })
        // the panel closes: the secret it held is not left on screen
        await waitFor(() => expect(screen.queryByLabelText("New password")).toBeNull())
    })

    it("keeps the server's refusal on the panel", async () => {
        draw(
            { [RESET_URL("u9")]: { body: { message: "this player is not enrolled in the tournament" }, status: 403 } },
            [row("u9", "Chi", "chi@example.test")]
        )

        await screen.findByText("Chi")
        await userEvent.click(screen.getByRole("button", { name: /Đặt mật khẩu/ }))
        await userEvent.type(screen.getByLabelText("New password"), "mat-khau-moi-1")
        await userEvent.click(screen.getByRole("button", { name: /^Cấp lại$/ }))

        expect(await screen.findByRole("alert")).toHaveTextContent(/not enrolled/)
        expect(screen.getByText(/Mật khẩu đầu cho Chi/)).toBeInTheDocument()
    })

    it("is offered for EVERY row — one with no password is exactly who needs it", async () => {
        draw({}, [
            row("u1", "Cũ", null, null, { hasPassword: false }),
            row("u2", "Bình", "binh@example.test"),
        ])

        await screen.findByText("Cũ")
        expect(screen.getAllByRole("button", { name: /Đặt mật khẩu/ })).toHaveLength(2)
        expect(screen.getByText("chưa có mật khẩu")).toBeInTheDocument()
    })
})
