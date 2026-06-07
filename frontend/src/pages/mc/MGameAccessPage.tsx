import { useState } from "react";
import { useNavigate } from "react-router-dom";

const MGameAccessPage: React.FC = () => {
    const [matchCode, setMatchCode] = useState("");
    const navigate = useNavigate();

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!matchCode) return;
        sessionStorage.setItem("matchCode", matchCode);
        try {
            window.dispatchEvent(new Event("oc3_matchCode_set"));
        } catch {
            // ignore
        }
        navigate(`/mc/waiting/${matchCode}`);
    };

    return (
        <div className="flex flex-col justify-center items-center h-screen overflow-hidden bg-cover bg-center p-4">

            <div className="card">
                <div className="gap-2 text-center">
                    <h1 className="text-4xl font-[SVN-Gratelos_Display] font-bold mb-2">OLYMPIA CUSTOM 3</h1>
                    <h2 className="text-xl font-bold mb-1">Màn hình MC</h2>
                    <p className="text-sm text-white/60 mb-5">Nhập mã trận để theo dõi</p>
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

export default MGameAccessPage;
