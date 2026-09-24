import { Routes, Route, Navigate } from "react-router-dom";
import OverlayScoreboard from "@/pages/overlay/OverlayScoreboard";
import OverlayTimer from "@/pages/overlay/OverlayTimer";
import OverlayQuestion from "@/pages/overlay/OverlayQuestion";
import OverlayPlayerBar from "@/pages/overlay/OverlayPlayerBar";
import OverlayPreviewPage from "@/pages/overlay/OverlayPreviewPage";
import OverlayRoundPage from "@/pages/overlay/OverlayRoundPage";

const OverlayRoutes = () => {
  return (
    <Routes>
      <Route path="/:matchCode" element={<OverlayPreviewPage />} />
      <Route path="/:matchCode/scoreboard" element={<OverlayScoreboard />} />
      <Route path="/:matchCode/timer" element={<OverlayTimer />} />
      <Route path="/:matchCode/question" element={<OverlayQuestion />} />
      <Route path="/:matchCode/player-bar" element={<OverlayPlayerBar />} />
      <Route path="/:matchCode/round/:round" element={<OverlayRoundPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default OverlayRoutes;
