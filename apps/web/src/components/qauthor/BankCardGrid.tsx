import React from "react";
import { Paperclip } from "lucide-react";
import { StatusBadge } from "@/components/shared/StatusBadges";
import { useAvatarSrc } from "@/hooks/useAvatarSrc";
import type { BankData } from "./bankTypes";

interface BankCardGridProps {
  rows: BankData[];
  loading?: boolean;
  emptyText?: string;
  pager?: React.ReactNode;
}

const statusTone = (status: BankData["status"]) =>
  status === "approved" ? "success" : status === "rejected" ? "danger" : "warning";

const statusLabel = (status: BankData["status"]) =>
  status === "approved" ? "Đã duyệt" : status === "rejected" ? "Không duyệt" : "Chờ duyệt";

const mediaKind = (url: string): "image" | "video" | "audio" | "other" => {
  const path = url.split("?")[0].toLowerCase();
  if (/\.(jpe?g|png|gif|webp|svg)$/.test(path)) return "image";
  if (/\.(mp4|webm|mov|m4v|avi|mkv)$/.test(path)) return "video";
  if (/\.(mp3|wav|ogg|m4a|aac|flac|opus)$/.test(path)) return "audio";
  return "other";
};

function MediaThumb({ mediaUrl }: { mediaUrl: string }) {
  const kind = mediaKind(mediaUrl);
  const wantPreview = kind !== "other";
  const { src, loading, retry } = useAvatarSrc(wantPreview ? mediaUrl : null);

  const fallbackChip = (
    <div
      className="flex items-center gap-1.5 self-start rounded-lg bg-accent/40 px-2 py-1 text-xs text-muted-foreground"
      title={mediaUrl}
    >
      <Paperclip size={12} aria-hidden /> Có media đính kèm
    </div>
  );

  if (kind === "other") return fallbackChip;
  if (loading) return null;
  if (!src) return fallbackChip;
  if (kind === "image") {
    return (
      <img
        src={src}
        alt=""
        loading="lazy"
        onError={retry}
        className="h-28 w-full rounded-lg object-cover"
      />
    );
  }
  if (kind === "video") {
    return (
      <video
        src={src}
        controls
        preload="metadata"
        onError={retry}
        className="w-full max-h-40 rounded-lg bg-black/40"
      />
    );
  }
  if (kind === "audio") {
    return (
      <audio src={src} controls preload="metadata" onError={retry} className="w-full" />
    );
  }
  return fallbackChip;
}

export function BankCardGrid({
  rows,
  loading = false,
  emptyText = "Không có câu hỏi.",
  pager,
}: BankCardGridProps) {
  if (loading) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">Đang tải…</p>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-background/30 px-4 py-10 text-center">
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((q) => (
          <article
            key={q.bank_id}
            className="flex flex-col gap-2 rounded-xl border border-border/60 bg-background/30 p-3.5 transition-colors hover:bg-accent/30"
          >
            <div className="flex items-start justify-between gap-2">
              <code className="min-w-0 truncate  text-xs text-success">
                {q.bank_code}
              </code>
              <StatusBadge tone={statusTone(q.status)}>{statusLabel(q.status)}</StatusBadge>
            </div>
            <p className="line-clamp-3 text-sm text-foreground">{q.content}</p>
            <p className="line-clamp-2 text-sm font-semibold">
              <span className="font-normal text-muted-foreground">Đáp án: </span>
              {q.answer}
            </p>
            {(q.round_hint || q.domain || q.hint_index) && (
              <div className="flex flex-wrap gap-1.5  text-[11px] text-muted-foreground">
                {q.round_hint && (
                  <span className="rounded bg-accent px-1.5 py-0.5">
                    {q.round_hint}
                  </span>
                )}
                {q.domain && (
                  <span className="rounded bg-accent px-1.5 py-0.5 text-brand">
                    {q.domain}
                    {q.difficulty ? `_${q.difficulty}` : ""}
                  </span>
                )}
                {q.hint_index && (
                  <span className="rounded bg-accent px-1.5 py-0.5 text-warning">
                    {q.hint_index}
                  </span>
                )}
              </div>
            )}
            {q.media_url && <MediaThumb mediaUrl={q.media_url} />}
          </article>
        ))}
      </div>
      {pager}
    </div>
  );
}

export default BankCardGrid;
