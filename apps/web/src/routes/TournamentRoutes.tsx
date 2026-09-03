import { Routes, Route, Navigate } from "react-router-dom";
import TournamentDetailPage from "@/pages/tournament/TournamentDetailPage";
import RegistrationPage from "@/pages/tournament/RegistrationPage";
import RulesPage from "@/pages/info/RulesPage";

const TournamentRoutes = () => {
  return (
    <Routes>
      <Route path="/:code" element={<TournamentDetailPage />} />
      <Route path="/:code/register" element={<RegistrationPage />} />
      <Route path="/:code/rules" element={<RulesPage />} />
      <Route path="/:code/match/:matchSlug" element={<Navigate to="/spectator" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default TournamentRoutes;
