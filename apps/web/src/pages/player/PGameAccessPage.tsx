import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePlayerProtection } from "@/hooks/usePlayerProtection";

const GameAccessPage: React.FC = () => {
  usePlayerProtection(true);
  const [matchCode, setMatchCode] = useState("");
  const navigate = useNavigate();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!matchCode) return;
    localStorage.setItem("matchCode", matchCode);

    try {
      window.dispatchEvent(new Event("oc3_matchCode_set"));
    } catch {}
    navigate(`/player/waiting/${matchCode}`);
  };

  return (
    <div className="flex flex-col justify-center items-center h-screen overflow-hidden bg-cover bg-center">
      <div className="card">
        <div className="gap-2 text-center">
          <h1 className="text-4xl font-[SVN-Gratelos_Display] font-bold mb-2">
            OLYMPIA CUSTOM 3
          </h1>
          <h2 className="text-xl font-bold mb-5">Chuẩn bị vào trận đấu</h2>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block mb-1 font-medium">Mã trận đấu</label>
            <input
              type="text"
              value={matchCode}
              onChange={(e) => setMatchCode(e.target.value)}
              className="w-full px-3 py-2 rounded bg-white text-black border border-(--oc-border) focus:outline-none focus:border-(--oc-border)"
            />
          </div>
          <button type="submit" className="mt-4 btn-primary-full">
            Vào trận đấu
          </button>
        </form>
      </div>
    </div>
  );
};

export default GameAccessPage;
