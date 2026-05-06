import React from "react";

const MWaitingPage: React.FC = () => {
    const matchCode = sessionStorage.getItem("matchCode") || "";

    return (
        <div className="flex flex-col justify-center items-center h-screen overflow-hidden">
            <div className="card text-center">
                <h1 className="text-3xl font-bold mb-2">MC - Chờ vào trận</h1>
                <p className="mb-4">Mã trận: <strong>{matchCode}</strong></p>
                <p className="text-sm text-white/70">Hệ thống sẽ tự chuyển màn hình khi trận đấu bắt đầu.</p>
            </div>
        </div>
    );
};

export default MWaitingPage;
