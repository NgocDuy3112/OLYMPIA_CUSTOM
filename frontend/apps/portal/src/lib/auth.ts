import { useMutation, useQueryClient } from "@tanstack/react-query"
import { api, ApiError } from "@shared/lib/api"
import { ME_QUERY_KEY } from "@/lib/session"

interface LoginStart {
    state: "mfa" | "enroll"
    pendingToken: string
    otpauthUri?: string
}

export function useLogin() {
    return useMutation({
        mutationFn: (input: { username: string; password: string }) =>
            api<LoginStart>("/portal/auth/login", {
                method: "POST",
                body: JSON.stringify(input),
            }),
    })
}

export function useVerifyMfa() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (input: { pendingToken: string; code: string }) =>
            api<{ ok: true }>("/portal/auth/mfa", {
                method: "POST",
                body: JSON.stringify(input),
            }),

        onSuccess: async () => {
            await queryClient.refetchQueries({ queryKey: ME_QUERY_KEY })
        },
    })
}

type MfaFailure = "expired" | "reused" | "rate-limited" | "other"


// The backend sends one distinct sentence per reason, and no machine-readable
// code (fastify serializes every 401 as error: "Unauthorized"), so match the
// wording deliberately — see FinishMfa in backend/AOC.Api/Modules/Auth/AuthRoutes.cs.
export function classifyMfaFailure(error: unknown): MfaFailure {
    if (!(error instanceof ApiError)) return "other"
    if (error.status === 429) return "rate-limited"
    if (error.message.includes("expired")) return "expired"
    if (error.message.includes("already used")) return "reused"
    return "other"
}

export function loginErrorMessage(error: unknown): string {
    if (error instanceof ApiError) {
        if (error.status === 429) return "Too many attempts. Try again in a minute."
        return error.message
    }
    return "Something went wrong. Please try again."
}

