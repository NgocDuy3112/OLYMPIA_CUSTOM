import { Download } from "lucide-react"
import { Badge } from "@shared/ui/badge"
import { Button } from "@shared/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@shared/ui/card"
import { useRecording } from "@/lib/recording"


const when = (iso: string) => new Date(iso).toLocaleString()


// The match page's «Bản ghi» tab: one card per recorded segment (a match
// stopped mid-show yields one card per segment). Video streams straight from
// the bucket — the same public-URL construction question media uses.
export function RecordingsTab({
    tournamentId,
    matchId,
}: {
    tournamentId: string
    matchId: string
}) {
    const recording = useRecording(tournamentId, matchId)

    if (recording.isPending) {
        return <p className="text-sm text-muted-foreground">Đang tải bản ghi…</p>
    }
    if (recording.isError) {
        return (
            <p role="alert" className="text-sm text-destructive">
                {recording.error.message}
            </p>
        )
    }

    const items = recording.data.items
    if (items.length === 0) {
        return (
            <p className="text-sm text-muted-foreground">
                Chưa có bản ghi — bật «Ghi hình» trên sân khấu khi trận LIVE.
            </p>
        )
    }

    return (
        <div className="flex flex-col gap-4">
            {items.map((row) => (
                <Card key={row.id}>
                    <CardHeader>
                        <CardTitle className="flex flex-wrap items-center gap-2 text-sm font-medium">
                            {row.status === "RECORDING" && (
                                <Badge variant="outline" className="text-destructive">
                                    Đang ghi
                                </Badge>
                            )}
                            {row.status === "STOPPED" && <Badge variant="outline">Đã ghi</Badge>}
                            {row.status === "FAILED" && <Badge variant="destructive">Lỗi</Badge>}
                            <span className="font-normal text-muted-foreground">
                                Bắt đầu {when(row.startedAt)}
                            </span>
                        </CardTitle>
                        {row.status === "RECORDING" && (
                            <CardDescription>
                                Đang chạy — bản ghi sẽ xuất hiện ở đây sau khi dừng.
                            </CardDescription>
                        )}
                        {row.status === "STOPPED" && row.stoppedAt && (
                            <CardDescription>Dừng lúc {when(row.stoppedAt)}</CardDescription>
                        )}
                        {row.status === "FAILED" && (
                            <CardDescription className="text-destructive">
                                {row.error ?? "Không rõ lỗi."}
                            </CardDescription>
                        )}
                    </CardHeader>
                    {row.status === "STOPPED" && row.url && (
                        <CardContent className="flex flex-col gap-3">
                            <video
                                controls
                                preload="metadata"
                                src={row.url}
                                className="aspect-video w-full rounded-lg bg-black"
                            />
                            <span>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => window.open(row.url!, "_blank", "noopener")}
                                >
                                    <Download className="size-4" aria-hidden />
                                    Tải file gốc
                                </Button>
                            </span>
                        </CardContent>
                    )}
                </Card>
            ))}
        </div>
    )
}
