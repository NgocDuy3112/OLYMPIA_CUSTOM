import * as React from "react";
import {
  useTable,
  type PaginationState,
  type RowData,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "cn";
import {
  dataTableFeatures,
  type DataTableColumn,
} from "./data-table-core";

interface ServerPagination {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
}

interface DataTableProps<TData extends RowData> {
  columns: DataTableColumn<TData>[];
  data: TData[];
  loading?: boolean;
  emptyText?: string;
  pageSize?: number;
  serverPagination?: ServerPagination;
  onRowClick?: (row: TData) => void;
  rowClassName?: (row: TData) => string | undefined;
  bare?: boolean;
  className?: string;
}

const pageItems = (page: number, count: number): Array<number | "gap"> => {
  const picked = Array.from(
    new Set(
      [0, count - 1, page - 1, page, page + 1].filter(
        (i) => i >= 0 && i < count,
      ),
    ),
  ).sort((a, b) => a - b);
  const items: Array<number | "gap"> = [];
  picked.forEach((i, idx) => {
    if (idx > 0 && i - picked[idx - 1]! > 1) items.push("gap");
    items.push(i);
  });
  return items;
};

export function DataTablePager({
  page,
  count,
  go,
}: {
  page: number;
  count: number;
  go: (p: number) => void;
}) {
  if (count <= 1) return null;
  const items = pageItems(page, count);
  const canPrev = page > 0;
  const canNext = page < count - 1;
  return (
    <div className="flex justify-end pt-3">
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              text="Trước"
              aria-disabled={!canPrev || undefined}
              onClick={canPrev ? () => go(page - 1) : undefined}
              className={cn(!canPrev && "pointer-events-none opacity-40")}
            />
          </PaginationItem>
          {items.map((it, idx) =>
            it === "gap" ? (
              <PaginationItem key={`gap-${idx}`}>
                <PaginationEllipsis />
              </PaginationItem>
            ) : (
              <PaginationItem key={it}>
                <PaginationLink
                  isActive={it === page}
                  onClick={() => go(it)}
                  aria-label={`Trang ${it + 1}`}
                >
                  {it + 1}
                </PaginationLink>
              </PaginationItem>
            ),
          )}
          <PaginationItem>
            <PaginationNext
              text="Sau"
              aria-disabled={!canNext || undefined}
              onClick={canNext ? () => go(page + 1) : undefined}
              className={cn(!canNext && "pointer-events-none opacity-40")}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}

export function DataTable<TData extends RowData>({
  columns,
  data,
  loading = false,
  emptyText = "Không có dữ liệu.",
  pageSize,
  serverPagination,
  onRowClick,
  rowClassName,
  bare = false,
  className,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const clientPageSize =
    serverPagination || !pageSize ? Math.max(data.length, 1) : pageSize;
  const [pagination, setPagination] = React.useState<PaginationState>({
    pageIndex: 0,
    pageSize: clientPageSize,
  });

  React.useEffect(() => {
    setPagination((p) => ({ ...p, pageSize: clientPageSize }));
  }, [clientPageSize]);

  const table = useTable({
    features: dataTableFeatures,
    data,
    columns,
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
  });

  const rows = table.getRowModel().rows;
  const colCount = columns.length;
  const pagerTarget = serverPagination
    ? {
        page: serverPagination.page,
        count: Math.max(1, serverPagination.pageCount),
        go: serverPagination.onPageChange,
      }
    : pageSize
      ? {
          page: pagination.pageIndex,
          count: Math.max(1, Math.ceil(data.length / pagination.pageSize)),
          go: (p: number) =>
            setPagination((prev) => ({ ...prev, pageIndex: p })),
        }
      : null;

  return (
    <div className={cn("w-full", className)}>
      <div className={bare ? "w-full" : "overflow-hidden rounded-xl border border-border"}>
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow
                key={headerGroup.id}
                className="border-b border-border hover:bg-transparent"
              >
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className="text-brand">
                    {header.isPlaceholder ? null : header.column.getCanSort() ? (
                      <button
                        type="button"
                        className="flex items-center gap-1.5 uppercase tracking-wide hover:text-foreground transition-colors"
                        onClick={header.column.getToggleSortingHandler()}
                        title="Bấm để sắp xếp"
                      >
                        <table.FlexRender header={header} />
                        {header.column.getIsSorted() === "asc" ? (
                          <ArrowUp size={12} aria-hidden />
                        ) : header.column.getIsSorted() === "desc" ? (
                          <ArrowDown size={12} aria-hidden />
                        ) : (
                          <ArrowUpDown size={12} className="opacity-50" aria-hidden />
                        )}
                      </button>
                    ) : (
                      <table.FlexRender header={header} />
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={colCount} className="h-24 text-center text-muted-foreground">
                  Đang tải…
                </TableCell>
              </TableRow>
            ) : rows.length ? (
              rows.map((row) => (
                <TableRow
                  key={row.id}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  className={cn(
                    "border-b border-border/50 last:border-0",
                    onRowClick && "cursor-pointer hover:bg-accent/50",
                    rowClassName?.(row.original),
                  )}
                >
                  {row.getAllCells().map((cell) => (
                    <TableCell key={cell.id}>
                      <table.FlexRender cell={cell} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={colCount}
                  className="h-24 text-center text-muted-foreground"
                >
                  {emptyText}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {!loading && rows.length > 0 && pagerTarget && (
        <DataTablePager
          page={pagerTarget.page}
          count={pagerTarget.count}
          go={pagerTarget.go}
        />
      )}
    </div>
  );
}
