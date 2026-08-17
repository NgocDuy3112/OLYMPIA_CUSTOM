import { Routes, Route, Navigate } from "react-router-dom";
import OverlayScoreboard from "@/pages/overlay/OverlayScoreboard";
import OverlayTimer from "@/pages/overlay/OverlayTimer";
import OverlayQuestion from "@/pages/overlay/OverlayQuestion";
import OverlayPlayerBar from "@/pages/overlay/OverlayPlayerBar";

const OverlayRoutes = () => {
  return (
    <Routes>
      <Route path="/:matchCode/scoreboard" element={<OverlayScoreboard />} />
      <Route path="/:matchCode/timer" element={<OverlayTimer />} />
      <Route path="/:matchCode/question" element={<OverlayQuestion />} />
      <Route path="/:matchCode/player-bar" element={<OverlayPlayerBar />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default OverlayRoutes;
