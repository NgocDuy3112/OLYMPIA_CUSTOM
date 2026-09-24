/** Helper dùng chung cho Lịch thi đấu (không chứa component). */

export function formatScheduleTime(iso: string | null | undefined): string {
  if (!iso) return "Chưa xếp lịch";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Chưa xếp lịch";
  return d.toLocaleString("vi-VN", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** ISO (có giờ) -> giá trị input datetime-local "YYYY-MM-DDTHH:mm". */
export function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
