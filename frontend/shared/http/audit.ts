import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api, type PageResult } from "@shared/lib/api"
import { useSocketStream, type StreamStatus } from "@shared/lib/ws"
import type {
    AuditActionsResponse,
    AuditEventRow,
    AuditFilterParams,
    AuditStreamFrame,
} from "@shared/wire/audit"

export interface AuditListParams extends AuditFilterParams {
    limit: number
    offset: number
}

const FILTER_FIELDS = ["q", "action", "actorId", "targetId", "matchId", "from", "to"] as const

function filterParams(filters: AuditFilterParams): URLSearchParams {
    const params = new URLSearchParams()
    for (const field of FILTER_FIELDS) {
        const value = filters[field]
        if (value) params.set(field, value)
    }
    return params
}

export const auditEventsKey = (params: AuditListParams) => ["audit-events", params] as const

export function useAuditEvents(params: AuditListParams, streamStatus: StreamStatus) {
    return useQuery({
        queryKey: auditEventsKey(params),
        queryFn: () => {
            const query = filterParams(params)
            query.set("limit", String(params.limit))
            query.set("offset", String(params.offset))
            return api<PageResult<AuditEventRow>>(`/portal/audit-events?${query.toString()}`)
        },
        refetchInterval: (query) => {
            if (streamStatus === "live") return false
            if (query.state.status === "error") return 15_000
            return 5_000
        },
        staleTime: 0,
        retry: false,
    })
}

export function useAuditEventsActions() {
    return useQuery({
        queryKey: ["audit-events", "actions"],
        queryFn: () => api<AuditActionsResponse>("/portal/audit-events/actions"),
        retry: false,
    })
}

export function auditExportUrl(filters: AuditFilterParams): string {
    const query = filterParams(filters).toString()
    if (query.length === 0) return "/portal/audit-events/export"
    return `/portal/audit-events/export?${query}`
}

export function useAuditStream(params: AuditListParams): StreamStatus {
    const queryClient = useQueryClient()

    const stream = useSocketStream("/portal/audit/stream", true, (message) => {
        const frame = message as AuditStreamFrame | null
        if (!frame || frame.type !== "audit_event") return
        if (params.offset !== 0) return
        if (filterParams(params).toString().length > 0) return

        const event = frame.data.event
        queryClient.setQueryData<PageResult<AuditEventRow>>(auditEventsKey(params), (page) => {
            if (!page) return page
            if (page.items.some((row) => row.id === event.id)) return page
            return { ...page, items: [event, ...page.items], total: page.total + 1 }
        })
    })

    return stream.status
}
