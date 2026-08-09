import { Routes, Route, Navigate } from "react-router-dom";
import SMatchListPage from "@/pages/spectator/SMatchListPage";
import SLiveMatchPage from "@/pages/spectator/SLiveMatchPage";
import SReplayMatchPage from "@/pages/spectator/SReplayMatchPage";

const SpectatorRoutes = () => {
  return (
    <Routes>
      <Route path="/" element={<SMatchListPage />} />
      <Route path="/live/:matchCode" element={<SLiveMatchPage />} />
      <Route path="/replay/:matchCode" element={<SReplayMatchPage />} />
      <Route path="*" element={<Navigate to="/spectator" replace />} />
    </Routes>
  );
};

export default SpectatorRoutes;
