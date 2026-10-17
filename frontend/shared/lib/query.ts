import { QueryClient } from "@tanstack/react-query"
import { ApiError } from "./api"

export function createQueryClient(): QueryClient {
    return new QueryClient({
        defaultOptions: {
            queries: {
                // 4xx are answers, not transient failures — don't retry them.
                retry: (failureCount, error) => {
                    if (error instanceof ApiError && error.status < 500) return false
                    return failureCount < 2
                },
                staleTime: 30_000,
                refetchOnWindowFocus: false,
            },
        },
    })
}