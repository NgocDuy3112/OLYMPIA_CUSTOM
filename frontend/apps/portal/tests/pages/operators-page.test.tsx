import { afterEach, describe, expect, it, vi } from "vitest"
import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { OperatorsPage } from "@/pages/OperatorsPage"
import { renderWithProviders } from "../helpers/render"

afterEach(() => {
    vi.unstubAllGlobals()
})

describe("OperatorsPage", () => {
    it("accepts the invite from the dialog instead of printing a curl", async () => {
        const user = userEvent.setup()
        const { fetchMock } = renderWithProviders(<OperatorsPage />, {
            routes: {
                "GET /portal/operators": { body: { items: [] } },
                "POST /portal/operators": { body: { inviteToken: "invite-token-1" } },
                "POST /portal/invites/accept": { body: { ok: true } },
            },
        })

        await user.click(await screen.findByRole("button", { name: /New operator/ }))
        const dialog = await screen.findByRole("dialog")
        await user.type(within(dialog).getByLabelText("Username"), "ngoc.duy")
        await user.click(within(dialog).getByRole("button", { name: "Create operator" }))

        expect(await within(dialog).findByText("invite-token-1")).toBeInTheDocument()
        expect(within(dialog).queryByText(/curl/)).toBeNull()

        await user.type(within(dialog).getByLabelText("Password"), "correct-horse-battery")
        await user.type(within(dialog).getByLabelText("Confirm password"), "correct-horse-battery")
        await user.click(await within(dialog).findByRole("button", { name: "Accept invite" }))

        const call = fetchMock?.mock.calls.find(
            ([url, init]) => url === "/portal/invites/accept" && init?.method === "POST"
        )
        expect(JSON.parse(String(call?.[1]?.body))).toEqual({
            token: "invite-token-1",
            password: "correct-horse-battery",
        })
        expect(await within(dialog).findByRole("status")).toHaveTextContent(/Invite accepted/)
    })

    it("blocks the accept until the two passwords match", async () => {
        const user = userEvent.setup()
        renderWithProviders(<OperatorsPage />, {
            routes: {
                "GET /portal/operators": { body: { items: [] } },
                "POST /portal/operators": { body: { inviteToken: "invite-token-1" } },
            },
        })

        await user.click(await screen.findByRole("button", { name: /New operator/ }))
        const dialog = await screen.findByRole("dialog")
        await user.type(within(dialog).getByLabelText("Username"), "ngoc.duy")
        await user.click(within(dialog).getByRole("button", { name: "Create operator" }))

        await user.type(await within(dialog).findByLabelText("Password"), "correct-horse-battery")
        await user.type(within(dialog).getByLabelText("Confirm password"), "different")

        expect(within(dialog).getByRole("button", { name: "Accept invite" })).toBeDisabled()
        expect(within(dialog).getByText("Passwords do not match")).toBeInTheDocument()
    })
})
