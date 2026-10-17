import { afterEach, describe, expect, it, vi } from "vitest"
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Route, Routes } from "react-router-dom"

import { LoginForm } from "@/components/login-form"
import { renderWithProviders, stubFetch } from "../helpers/render"

function renderLoginForm() {
    return renderWithProviders(
        <MemoryRouter initialEntries={["/login"]}>
            <Routes>
                <Route path="/login" element={<LoginForm />} />
                <Route path="/" element={<p>dashboard</p>} />
            </Routes>
        </MemoryRouter>,
    )
}

async function submitCredentials(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByLabelText("Username"), "ADMIN")
    await user.type(screen.getByLabelText("Password"), "correct horse battery")
    await user.click(screen.getByRole("button", { name: "Continue" }))
}

afterEach(() => {
    vi.unstubAllGlobals()
})

describe("LoginForm", () => {
    it("asks only for a code when the account is already enrolled", async () => {
        const user = userEvent.setup()
        stubFetch({ "POST /portal/auth/login": { body: { state: "mfa", pendingToken: "p1" } } })
        renderLoginForm()

        await submitCredentials(user)

        expect(await screen.findByText("Two-factor code")).toBeInTheDocument()
        expect(screen.queryByText(/manually/i)).not.toBeInTheDocument()
    })

    it("shows a QR and the raw secret on first login", async () => {
        const user = userEvent.setup()
        stubFetch({
            "POST /portal/auth/login": {
                body: {
                    state: "enroll",
                    pendingToken: "p2",
                    otpauthUri: "otpauth://totp/OC:ADMIN?secret=JBSWY3DPEHPK3PXP&issuer=OC",
                },
            },
        })
        renderLoginForm()

        await submitCredentials(user)

        expect(await screen.findByText("Set up your authenticator")).toBeInTheDocument()
        expect(screen.getByTitle("Authenticator setup QR code")).toBeInTheDocument()
        expect(screen.getByText("JBSWY3DPEHPK3PXP")).toBeInTheDocument()
    })

    it("submits the code and lands on the dashboard", async () => {
        const user = userEvent.setup()
        const fetchMock = stubFetch({
            "POST /portal/auth/login": { body: { state: "mfa", pendingToken: "p3" } },
            "POST /portal/auth/mfa": { body: { ok: true } },
        })
        renderLoginForm()

        await submitCredentials(user)
        await user.type(await screen.findByRole("textbox"), "123456")
        await user.click(screen.getByRole("button", { name: "Confirm" }))

        expect(await screen.findByText("dashboard")).toBeInTheDocument()
        expect(fetchMock).toHaveBeenCalledWith(
            "/portal/auth/mfa",
            expect.objectContaining({
                method: "POST",
                body: JSON.stringify({ pendingToken: "p3", code: "123456" }),
            }),
        )
    })

    it("explains a reused code and clears the field", async () => {
        const user = userEvent.setup()
        stubFetch({
            "POST /portal/auth/login": { body: { state: "mfa", pendingToken: "p4" } },
            "POST /portal/auth/mfa": { body: { message: "Invalid or reused code" }, status: 401 },
        })
        renderLoginForm()

        await submitCredentials(user)
        const otp = await screen.findByRole("textbox")
        await user.type(otp, "111111")
        await user.click(screen.getByRole("button", { name: "Confirm" }))

        expect(await screen.findByRole("alert")).toHaveTextContent(/already used/i)
        expect(otp).toHaveValue("")
    })

    it("returns to the credentials step when the pending token expires", async () => {
        const user = userEvent.setup()
        stubFetch({
            "POST /portal/auth/login": { body: { state: "mfa", pendingToken: "p5" } },
            "POST /portal/auth/mfa": {
                body: { message: "Login session expired, start again" },
                status: 401,
            },
        })
        renderLoginForm()

        await submitCredentials(user)
        await user.type(await screen.findByRole("textbox"), "222222")
        await user.click(screen.getByRole("button", { name: "Confirm" }))

        expect(await screen.findByText("Sign in")).toBeInTheDocument()
        expect(screen.getByRole("alert")).toHaveTextContent(/took too long/i)
    })

    it("shows the server's message for bad credentials", async () => {
        const user = userEvent.setup()
        stubFetch({
            "POST /portal/auth/login": {
                body: { message: "Invalid username or password" },
                status: 401,
            },
        })
        renderLoginForm()

        await submitCredentials(user)

        expect(await screen.findByRole("alert")).toHaveTextContent(
            "Invalid username or password"
        )
    })

    it("explains a rate limit instead of showing the raw 429", async () => {
        const user = userEvent.setup()
        stubFetch({
            "POST /portal/auth/login": {
                body: { message: "Rate limit exceeded, retry in 42 seconds" },
                status: 429,
            },
        })
        renderLoginForm()

        await submitCredentials(user)

        expect(await screen.findByRole("alert")).toHaveTextContent(/too many attempts/i)
    })
})