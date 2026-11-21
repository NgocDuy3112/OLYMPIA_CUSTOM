import { Badge } from "@shared/ui/badge"
import { STATUS_LABEL } from "./model"
import type { Status } from "./model"

export function StatusBadge({ status }: { status: Status }) {
    let variant: "default" | "secondary" | "outline" = "outline"
    if (status === "PUBLISHED") variant = "default"
    if (status === "ARCHIVED") {
        return <Badge variant="outline" className="line-through opacity-60">Archived</Badge>
    }
    return <Badge variant={variant}>{STATUS_LABEL[status]}</Badge>
}
