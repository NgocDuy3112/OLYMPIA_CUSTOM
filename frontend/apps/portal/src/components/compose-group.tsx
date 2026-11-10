import { useCallback, useState } from "react"
import {
    DndContext,
    DragOverlay,
    KeyboardSensor,
    PointerSensor,
    closestCenter,
    useDraggable,
    useDroppable,
    useSensor,
    useSensors,
    type DragEndEvent,
} from "@dnd-kit/core"
import {
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical, Plus, X } from "lucide-react"
import { Badge } from "@shared/ui/badge"
import { Button } from "@shared/ui/button"


export interface ComposeRow {
    id: string 
    primary: string 
    secondary?: string 
    badge?: string 
    warning?: boolean 
}

interface ActiveData {
    role: "row" | "picker"
    groupId?: string
    index?: number
    sourceId?: string
    // Rendered by the DragOverlay ghost — without these the overlay has
    // nothing to show while the source item sits dimmed in its slot.
    label?: string
    badge?: string
}

interface OverData {
    role: "row" | "list"
    groupId: string
    index?: number
    count?: number
}


export interface ComposeDndProviderProps {
    children: React.ReactNode
    onAdd: (sourceId: string, groupId: string, index: number) => void
    onReorder: (groupId: string, from: number, to: number) => void
}

export function ComposeDndProvider({
    children,
    onAdd,
    onReorder,
}: ComposeDndProviderProps) {
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    )

    const handleDragEnd = useCallback(
        (event: DragEndEvent) => {
            const active = event.active.data.current as ActiveData | undefined
            const over = (event.over?.data.current ?? undefined) as OverData | undefined
            if (!event.over || !active || !over) return

            if (active.role === "picker" && active.sourceId) {
                if (over.role === "row") onAdd(active.sourceId, over.groupId, over.index ?? 0)
                else onAdd(active.sourceId, over.groupId, over.count ?? 0)
                return
            }

            if (active.role === "row") {
                if (!active.groupId || over.groupId !== active.groupId) return
                const from = active.index ?? 0
                const to =
                    over.role === "row"
                        ? over.index ?? from
                        : Math.max(0, (over.count ?? 1) - 1)
                if (from !== to) onReorder(active.groupId, from, to)
            }
        },
        [onAdd, onReorder]
    )

    const [dragging, setDragging] = useState<ActiveData | null>(null)

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={(event) =>
                setDragging((event.active.data.current as ActiveData | undefined) ?? null)
            }
            onDragCancel={() => setDragging(null)}
            onDragEnd={(event) => {
                setDragging(null)
                handleDragEnd(event)
            }}
        >
            {children}
            {/* The ghost that follows the pointer. Portalled to <body>, so no
                ancestor transform can throw its coordinates off. */}
            <DragOverlay>
                {dragging?.label && (
                    <div className="pointer-events-none flex max-w-64 items-center gap-2 rounded-md border border-primary bg-background px-2 py-1.5 text-sm shadow-lg">
                        <GripVertical className="size-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 truncate">{dragging.label}</span>
                        {dragging.badge && (
                            <Badge variant="outline" className="shrink-0">
                                {dragging.badge}
                            </Badge>
                        )}
                    </div>
                )}
            </DragOverlay>
        </DndContext>
    )
}


export interface ComposeGroupProps {
    groupId: string 
    label: string 
    typeLabel?: string 
    filled: number
    required: number
    rows: ComposeRow[]
    editable?: boolean
    onRemove?: (rowId: string) => void
    onAddClick?: () => void
    emptyHint?: string
}

export function ComposeGroup({
    groupId,
    label,
    typeLabel,
    filled,
    required,
    rows,
    editable = false,
    onRemove,
    onAddClick,
    emptyHint = "Kéo câu hỏi từ ngân hàng vào nhóm này",
}: ComposeGroupProps) {
    const { setNodeRef, isOver } = useDroppable({
        id: `list:${groupId}`,
        data: { role: "list", groupId, count: rows.length } satisfies OverData,
    })

    const complete = required === 0 || filled >= required
    const coverage =
        required > 0
            ? `${filled}/${required} ${complete ? "✓" : "⚠"}`
            : `${filled}`

    return (
        <section
            ref={setNodeRef}
            aria-label={`Nhóm ${label}`}
            className={
                "rounded-lg border bg-card transition-colors " +
                (isOver && editable ? "border-primary" : "border-border")
            }
        >
            <header className="flex items-center gap-2 border-b border-border px-3 py-2">
                <span className="text-sm font-semibold">{label}</span>
                {typeLabel && <Badge variant="secondary">{typeLabel}</Badge>}
                <span
                    className={
                        "ml-auto text-xs font-medium " +
                        (complete ? "text-muted-foreground" : "text-amber-600")
                    }
                >
                    {coverage}
                </span>
            </header>

            <SortableContext
                items={rows.map((row) => row.id)}
                strategy={verticalListSortingStrategy}
            >
                <ul className="grid gap-1 p-2">
                    {rows.length === 0 && (
                        <li className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                            {emptyHint}
                        </li>
                    )}
                    {rows.map((row, index) => (
                        <SortableGroupRow
                            key={row.id}
                            row={row}
                            groupId={groupId}
                            index={index}
                            editable={editable}
                            onRemove={onRemove}
                        />
                    ))}
                </ul>
            </SortableContext>

            {editable && onAddClick && (
                <div className="px-2 pb-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start text-muted-foreground"
                        onClick={onAddClick}
                    >
                        <Plus className="size-4" /> thêm câu
                    </Button>
                </div>
            )}
        </section>
    )
}

function SortableGroupRow({
    row,
    groupId,
    index,
    editable,
    onRemove,
}: {
    row: ComposeRow
    groupId: string
    index: number
    editable: boolean
    onRemove?: (rowId: string) => void
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
        useSortable({
            id: row.id,
            data: {
                role: "row",
                groupId,
                index,
                label: row.primary,
                badge: row.badge,
            } satisfies ActiveData,
            disabled: !editable,
        })

    return (
        <li
            ref={setNodeRef}
            style={{
                transform: CSS.Transform.toString(transform),
                transition,
            }}
            className={
                "flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5 text-sm " +
                (isDragging ? "opacity-60 shadow-sm" : "")
            }
        >
            {editable && (
                <button
                    type="button"
                    {...attributes}
                    {...listeners}
                    aria-label={`Kéo để sắp xếp: ${row.primary}`}
                    className="touch-none cursor-grab text-muted-foreground hover:text-foreground"
                >
                    <GripVertical className="size-4" />
                </button>
            )}
            <span className="min-w-0 flex-1 truncate">{row.primary}</span>
            {row.secondary && (
                <span className="shrink-0 text-xs text-muted-foreground">{row.secondary}</span>
            )}
            {row.badge && (
                <Badge variant="outline" className="shrink-0">
                    {row.badge}
                </Badge>
            )}
            {row.warning && (
                <span
                    className="shrink-0 text-amber-600"
                    title="Nguồn đã sửa kể từ khi sao chép"
                    aria-label="Nguồn đã sửa"
                >
                    ⚠
                </span>
            )}
            {editable && onRemove && (
                <button
                    type="button"
                    onClick={() => onRemove(row.id)}
                    aria-label={`Gỡ khỏi trận: ${row.primary}`}
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                >
                    <X className="size-4" />
                </button>
            )}
        </li>
    )
}


export interface BankPickerItemProps {
    sourceId: string
    primary: string
    secondary?: string
    typeBadge?: string
    disabled?: boolean
    onClick?: () => void
}

export function BankPickerItem({
    sourceId,
    primary,
    secondary,
    typeBadge,
    disabled = false,
    onClick,
}: BankPickerItemProps) {
    const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
        id: `picker:${sourceId}`,
        data: { role: "picker", sourceId, label: primary, badge: typeBadge } satisfies ActiveData,
        disabled,
    })

    return (
        <li
            ref={setNodeRef}
            {...listeners}
            {...attributes}
            onClick={onClick}
            className={
                "flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5 text-sm " +
                (disabled
                    ? "opacity-50"
                    : "cursor-grab hover:border-primary " + (isDragging ? "opacity-60" : ""))
            }
        >
            <GripVertical className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{primary}</span>
            {secondary && (
                <span className="shrink-0 text-xs text-muted-foreground">{secondary}</span>
            )}
            {typeBadge && (
                <Badge variant="outline" className="shrink-0">
                    {typeBadge}
                </Badge>
            )}
        </li>
    )
}
