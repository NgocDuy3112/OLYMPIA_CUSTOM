import { useState } from "react";
import { useNavigate } from "react-router-dom";


const GameAccessPage: React.FC = () => {
    const [matchCode, setMatchCode] = useState("");
    const navigate = useNavigate();

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!matchCode) return;
        sessionStorage.setItem("matchCode", matchCode);
        navigate(`/contestant/waiting`);
    };

    return (
        <div className="flex flex-col justify-center items-center min-h-screen bg-cover bg-center text-white">
            <div className="bg-blue-900 bg-opacity-50 p-10 rounded-xl shadow-lg w-full max-w-md">
                <div className="gap-2 text-center">
                    <h1 className="text-4xl font-[SVN-Gratelos_Display] font-bold mb-2">OLYMPIA CUSTOM 3</h1>
                    <h2 className="text-xl font-bold mb-5">Chuẩn bị vào trận đấu</h2>
                </div>
                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    <div>
                        <label className="block mb-1 font-medium">Mã trận đấu</label>
                        <input
                            type="text"
                            value={matchCode}
                            onChange={(e) => setMatchCode(e.target.value)}
                            className="w-full px-3 py-2 rounded bg-white text-black border border-blue-900 focus:outline-none focus:border-blue-500"
                        />
                    </div>
                    <button
                        type="submit"
                        className="mt-4 bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2 rounded transition-all duration-200"
                    >
                        VÀO PHÒNG
                    </button>
                </form>
            </div>
        </div>
    );
};

export default GameAccessPage;