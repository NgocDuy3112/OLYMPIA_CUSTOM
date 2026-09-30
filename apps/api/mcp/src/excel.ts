import ExcelJS from "exceljs";

/** Raw item — cùng shape POST /api/bank/import { items }; mapping cột SỐNG Ở API. */
export interface ParsedItem {
  sheet: string;
  row: number;
  cells: Record<string, unknown>;
}

function cellText(v: ExcelJS.CellValue): string | undefined {
  if (v === null || v === undefined) return undefined;
  if (typeof v === "string") return v.trim() || undefined;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    const o = v as unknown as Record<string, unknown>;
    if (Array.isArray(o.richText)) {
      const s = (o.richText as Array<{ text?: string }>)
        .map((t) => t.text ?? "")
        .join("")
        .trim();
      return s || undefined;
    }
    if (o.result !== undefined) return String(o.result);
    if (typeof o.text === "string") return o.text.trim() || undefined;
    if (o.error) return undefined;
  }
  return String(v).trim() || undefined;
}

/**
 * Parse file .xlsx local (chỉ stdio/TUI) → items gửi API.
 * Giữ NGUYÊN header tiếng Việt từng sheet — API map (1 chỗ).
 */
export async function parseBankXlsx(path: string): Promise<ParsedItem[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  const items: ParsedItem[] = [];
  for (const ws of wb.worksheets) {
    let headers: Array<string | null> = [];
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      const values = row.values as unknown[]; // ExcelJS1-based
      if (rowNumber === 1) {
        headers = values
          .slice(1)
          .map((v) => cellText(v as ExcelJS.CellValue) ?? null);
        return;
      }
      const cells: Record<string, unknown> = {};
      headers.forEach((h, i) => {
        if (!h) return;
        const val = cellText(values[i + 1] as ExcelJS.CellValue);
        if (val !== undefined) cells[h] = val;
      });
      if (Object.keys(cells).length > 0) {
        items.push({ sheet: ws.name, row: rowNumber, cells });
      }
    });
  }
  return items;
}
