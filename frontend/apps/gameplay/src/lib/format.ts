export function formatDay(date: string): string {
    const d = new Date(`${date}T00:00:00`)
    return d.toLocaleDateString("vi-VN", {
        weekday: "short",
        month: "short",
        day: "numeric",
    })
}