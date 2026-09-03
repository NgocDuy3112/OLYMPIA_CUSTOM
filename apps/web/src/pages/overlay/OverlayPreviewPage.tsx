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
import { Card, Button } from "@/components/shared/ui";
import { API_BASE_URL } from "@/configs";

interface OverlayItem {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  path: string;
  defaultWidth: number;
  defaultHeight: number;
}

const OVERLAYS: OverlayItem[] = [
  {
    id: "player-bar",
    name: "Player Bar",
    description: "Hiển thị tên và điểm các thí sinh",
    icon: <Users size={20} />,
    path: "player-bar",
    defaultWidth: 700,
    defaultHeight: 80,
  },
  {
    id: "scoreboard",
    name: "Scoreboard",
    description: "Bảng xếp hạng theo thời gian thực",
    icon: <Layout size={20} />,
    path: "scoreboard",
    defaultWidth: 320,
    defaultHeight: 400,
  },
  {
    id: "timer",
    name: "Timer",
    description: "Đồng hồ đếm giờ với vòng tròn tiến trình",
    icon: <Timer size={20} />,
    path: "timer",
    defaultWidth: 140,
    defaultHeight: 140,
  },
  {
    id: "question",
    name: "Question",
    description: "Hiển thị câu hỏi hiện tại",
    icon: <HelpCircle size={20} />,
    path: "question",
    defaultWidth: 700,
    defaultHeight: 300,
  },
];

const OverlayPreviewPage: React.FC = () => {
  const { matchCode } = useParams<{ matchCode: string }>();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [matchInfo, setMatchInfo] = useState<any>(null);

  useEffect(() => {
    if (!matchCode) return;

    const fetchMatch = async () => {
      try {
        const response = await fetch(
          `${API_BASE_URL}/matches/${matchCode}`,
          { credentials: "include" },
        );
        if (response.ok) {
          const data = await response.json();
          if (data.status === "success") {
            setMatchInfo(data.data);
          }
        }
      } catch {
        // Ignore error
      }
    };

    fetchMatch();
  }, [matchCode]);

  const getOverlayUrl = (overlay: OverlayItem) => {
    const baseUrl = window.location.origin;
    return `${baseUrl}/overlay/${matchCode}/${overlay.path}`;
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
        <Card className="text-center">
          <p className="text-gray-400">Cần match code để xem preview</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 sm:p-6 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">
            Overlay Preview
          </h1>
          <p className="text-gray-400">
            Xem trước và copy URL để thêm vào OBS
          </p>
          {matchInfo && (
            <div className="mt-2 flex items-center gap-2 text-sm text-gray-500">
              <Monitor size={14} />
              <span>Match: {matchInfo.matchName || matchCode}</span>
            </div>
          )}
        </motion.div>

        {/* Overlay Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {OVERLAYS.map((overlay, index) => (
            <motion.div
              key={overlay.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <Card className="!p-0 overflow-hidden">
                {/* Preview area */}
                <div className="relative h-40 bg-gray-950 flex items-center justify-center border-b border-white/10">
                  <iframe
                    src={getOverlayUrl(overlay)}
                    className="absolute inset-0 w-full h-full pointer-events-none"
                    style={{
                      transform: "scale(0.8)",
                      transformOrigin: "center",
                    }}
                    title={`Preview: ${overlay.name}`}
                  />

                  {/* Overlay info */}
                  <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
                    <span className="text-xs text-gray-500">
                      {overlay.defaultWidth} × {overlay.defaultHeight}
                    </span>
                  </div>
                </div>

                {/* Content */}
                <div className="p-4">
                  <div className="flex items-start gap-3 mb-3">
                    <div className="p-2 bg-blue-500/20 rounded-lg text-blue-400">
                      {overlay.icon}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-bold text-white">{overlay.name}</h3>
                      <p className="text-sm text-gray-400">
                        {overlay.description}
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleCopyUrl(overlay)}
                      leftIcon={
                        copiedId === overlay.id ? (
                          <Check size={14} />
                        ) : (
                          <Copy size={14} />
                        )
                      }
                      className="flex-1"
                    >
                      {copiedId === overlay.id ? "Đã copy!" : "Copy URL"}
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleOpenPreview(overlay)}
                      leftIcon={<ExternalLink size={14} />}
                    >
                      Preview
                    </Button>
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Instructions */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-8"
        >
          <Card>
            <h3 className="font-bold text-white mb-3">Hướng dẫn sử dụng</h3>
            <ol className="space-y-2 text-sm text-gray-400">
              <li className="flex gap-2">
                <span className="text-blue-400 font-bold">1.</span>
                Mở OBS Studio
              </li>
              <li className="flex gap-2">
                <span className="text-blue-400 font-bold">2.</span>
                Thêm Browser Source (Sources → Add → Browser)
              </li>
              <li className="flex gap-2">
                <span className="text-blue-400 font-bold">3.</span>
                Paste URL đã copy vào ô URL
              </li>
              <li className="flex gap-2">
                <span className="text-blue-400 font-bold">4.</span>
                Đặt Width/Height theo gợi ý (hoặc tuỳ chỉnh)
              </li>
              <li className="flex gap-2">
                <span className="text-blue-400 font-bold">5.</span>
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
