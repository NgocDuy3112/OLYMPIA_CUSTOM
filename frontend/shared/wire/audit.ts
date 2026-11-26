export interface AuditEventRow {
    id: string
    action: string
    actorId: string | null
    actorName: string | null
    targetId: string | null
    targetName: string | null
    matchId: string | null
    details: unknown
    ip: string | null
    userAgent: string | null
    createdAt: string
}

export interface AuditActionsResponse {
    actions: string[]
}

export interface AuditStreamFrame {
    v: number
    type: "audit_event"
    at: string
    data: { event: AuditEventRow }
}

export interface AuditFilterParams {
    q?: string
    action?: string
    actorId?: string
    targetId?: string
    matchId?: string
    from?: string
    to?: string
}
