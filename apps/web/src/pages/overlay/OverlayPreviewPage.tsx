import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Copy,
  Check,
  ExternalLink,
  Monitor,
  Layout,
  Timer,
  Users,
  HelpCircle,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiGet } from "@/api/client";
import { OVERLAYS, overlayUrl, type OverlayItem } from "./overlayList";

const OVERLAY_ICONS: Record<string, React.ReactNode> = {
  "player-bar": <Users size={20} />,
  scoreboard: <Layout size={20} />,
  timer: <Timer size={20} />,
  question: <HelpCircle size={20} />,
};

const OVERLAYS_WITH_ICONS: OverlayItem[] = OVERLAYS;

const OverlayPreviewPage: React.FC = () => {
  const { matchCode } = useParams<{ matchCode: string }>();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [matchInfo, setMatchInfo] = useState<any>(null);

  useEffect(() => {
    if (!matchCode) return;

    const fetchMatch = async () => {
      try {
        const data = await apiGet<{ matchCode: string; matchName: string }[]>(
          "/matches",
        );
        if (Array.isArray(data.data)) {
          const found = data.data.find(
            (m) => m.matchCode === matchCode,
          );
          if (found) setMatchInfo(found);
        }
      } catch {
      }
    };

    fetchMatch();
  }, [matchCode]);

  const getOverlayUrl = (overlay: OverlayItem) => {
    if (!matchCode) return "";
    return overlayUrl(matchCode, overlay.path);
  };

  const handleCopyUrl = async (overlay: OverlayItem) => {
    const url = getOverlayUrl(overlay);
    await navigator.clipboard.writeText(url);
    setCopiedId(overlay.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleOpenPreview = (overlay: OverlayItem) => {
    const url = getOverlayUrl(overlay);
    window.open(url, "_blank", `width=${overlay.defaultWidth},height=${overlay.defaultHeight}`);
  };

  if (!matchCode) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="px-4 text-center">
          <p className="text-muted-foreground">Cần match code để xem preview</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 sm:p-6 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      <div className="max-w-4xl mx-auto">
        {}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">
            Overlay Preview
          </h1>
          <p className="text-muted-foreground">
            Xem trước và copy URL để thêm vào OBS
          </p>
          {matchInfo && (
            <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
              <Monitor size={14} />
              <span>Match: {matchInfo.matchName || matchCode}</span>
            </div>
          )}
        </motion.div>

        {}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {OVERLAYS_WITH_ICONS.map((overlay, index) => (
            <motion.div
              key={overlay.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <Card className="p-0 overflow-hidden">
                {}
                <div className="relative h-40 bg-background flex items-center justify-center border-b border-border">
                  <iframe
                    src={getOverlayUrl(overlay)}
                    className="absolute inset-0 w-full h-full pointer-events-none"
                    style={{
                      transform: "scale(0.8)",
                      transformOrigin: "center",
                    }}
                    title={`Preview: ${overlay.name}`}
                  />

                  {}
                  <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {overlay.defaultWidth} × {overlay.defaultHeight}
                    </span>
                  </div>
                </div>

                {}
                <div className="p-4">
                  <div className="flex items-start gap-3 mb-3">
                    <div className="p-2 bg-primary/20 rounded-lg text-brand">
                      {OVERLAY_ICONS[overlay.id] ?? <Monitor size={20} />}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-bold text-foreground">{overlay.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {overlay.description}
                      </p>
                    </div>
                  </div>

                  {}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleCopyUrl(overlay)}
                      className="flex-1"
                    >
                      {copiedId === overlay.id ? (
                        <Check size={14} />
                      ) : (
                        <Copy size={14} />
                      )}
                      {copiedId === overlay.id ? "Đã copy!" : "Copy URL"}
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleOpenPreview(overlay)}
                    >
                      <ExternalLink size={14} />
                      Preview
                    </Button>
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>

        {}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-8"
        >
          <Card className="px-4">
            <h3 className="font-bold text-foreground mb-3">Hướng dẫn sử dụng</h3>
            <ol className="space-y-2 text-sm text-muted-foreground">
              <li className="flex gap-2">
                <span className="text-brand font-bold">1.</span>
                Mở OBS Studio
              </li>
              <li className="flex gap-2">
                <span className="text-brand font-bold">2.</span>
                Thêm Browser Source (Sources → Add → Browser)
              </li>
              <li className="flex gap-2">
                <span className="text-brand font-bold">3.</span>
                Paste URL đã copy vào ô URL
              </li>
              <li className="flex gap-2">
                <span className="text-brand font-bold">4.</span>
                Đặt Width/Height theo gợi ý (hoặc tuỳ chỉnh)
              </li>
              <li className="flex gap-2">
                <span className="text-brand font-bold">5.</span>
                Bỏ tick "Shutdown source when not visible" để overlay luôn
                chạy
              </li>
            </ol>
          </Card>
        </motion.div>
      </div>
    </div>
  );
};

export default OverlayPreviewPage;
