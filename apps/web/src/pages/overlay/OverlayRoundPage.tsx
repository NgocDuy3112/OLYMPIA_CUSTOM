import React from "react";
import { useParams } from "react-router-dom";
import { GameWebSocketProvider } from "@/contexts/GameWebSocketContext";
import { VeDichRound } from "@/types/veDich";
import { SButPhaPage } from "@/components/shared/SButPhaPage";
import { SGiaiMaPage } from "@/components/shared/SGiaiMaPage";
import { SKhoiDongPage } from "@/components/shared/SKhoiDongPage";
import { SVeDichPage } from "@/components/shared/SVeDichPage";
import { SVeDichPickPage } from "@/components/shared/SVeDichPickPage";
import { ROUND_KEYS, type RoundKey } from "./overlayList";

/** Layout gọn cho overlay vòng thi — nền thường (không trong suốt). */
const OverlayLayout: React.FC<{
  children?: React.ReactNode;
}> = ({ children }) => <div className="min-h-screen">{children}</div>;

/**
 * Overlay 1 vòng thi — tái dùng đúng component MC đang xem (S*),
 * nguồn WS theo matchCode, không cần đăng nhập (OBS không auth được).
 */
const OverlayRoundPage: React.FC = () => {
  const { matchCode = "", round = "" } = useParams<{
    matchCode: string;
    round: string;
  }>();

  const content = (() => {
    switch (round as RoundKey) {
      case "kdc":
        return <SKhoiDongPage variant="chung" Layout={OverlayLayout} matchCode={matchCode} />;
      case "kdr":
        return <SKhoiDongPage variant="rieng" Layout={OverlayLayout} matchCode={matchCode} />;
      case "bp":
        return <SButPhaPage Layout={OverlayLayout} matchCode={matchCode} />;
      case "gm":
        return <SGiaiMaPage Layout={OverlayLayout} matchCode={matchCode} />;
      case "vdc":
        return <SVeDichPage variant="chung" Layout={OverlayLayout} matchCode={matchCode} />;
      case "vdr":
        return <SVeDichPage variant="rieng" Layout={OverlayLayout} matchCode={matchCode} />;
      case "vdc-pick":
        return (
          <SVeDichPickPage round={VeDichRound.CHUNG} Layout={OverlayLayout} matchCode={matchCode} />
        );
      case "vdr-pick":
        return (
          <SVeDichPickPage round={VeDichRound.RIENG} Layout={OverlayLayout} matchCode={matchCode} />
        );
      default:
        return (
          <div className="min-h-screen flex items-center justify-center p-4">
            <p className="text-white/60 text-sm">
              Vòng không hợp lệ — chọn: {ROUND_KEYS.join(", ")}
            </p>
          </div>
        );
    }
  })();

  if (!matchCode) return null;

  return (
    <GameWebSocketProvider config={{ role: "spectator", matchCode }}>
      {content}
    </GameWebSocketProvider>
  );
};

export default OverlayRoundPage;
