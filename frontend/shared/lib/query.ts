import { QueryCache, QueryClient } from "@tanstack/react-query"
import { ApiError } from "./api"

// 4xx are answers, not transient failures — don't retry them.
export function shouldRetry(failureCount: number, error: unknown): boolean {
    if (error instanceof ApiError && error.status < 500) return false
    return failureCount < 2
}

export interface QueryClientOptions {
    sessionQueryKey?: readonly unknown[]
}

export function createQueryClient({
    sessionQueryKey,
}: QueryClientOptions = {}): QueryClient {
    const client = new QueryClient({
        queryCache: new QueryCache({
            onError: (error, query) => {
                if (!sessionQueryKey) return
                if (!(error instanceof ApiError) || error.status !== 401) return

                const isSessionQuery =
                    JSON.stringify(query.queryKey) === JSON.stringify(sessionQueryKey)
                if (isSessionQuery) return

                void client.invalidateQueries({ queryKey: sessionQueryKey })
            },
        }),

        defaultOptions: {
            queries: {
                retry: shouldRetry,
                staleTime: 30_000,
                refetchOnWindowFocus: false,
            },
        },
    })

    return client
}