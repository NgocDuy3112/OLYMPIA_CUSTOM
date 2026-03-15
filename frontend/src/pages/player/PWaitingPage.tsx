import React from "react";

const PWaitingPage: React.FC = () => {
	const matchCode = sessionStorage.getItem("matchCode") || "";
	const playerCode = sessionStorage.getItem("playerCode") || "";

	return (
		<div className="flex flex-col justify-center items-center h-screen overflow-hidden">
			<div className="card text-center">
				<h1 className="text-3xl font-bold mb-2">Chờ vào trận</h1>
				<p className="mb-4">Mã trận: <strong>{matchCode}</strong></p>
				{playerCode ? (
					<p className="mb-4">Mã thí sinh: <strong>{playerCode}</strong></p>
				) : (
					<p className="mb-4">Bạn đã vào phòng. Chờ kỹ thuật viên bắt đầu trận đấu.</p>
				)}
				<p className="text-sm text-white/70">Vui lòng đợi — hệ thống sẽ đưa bạn vào lượt khi trận đấu bắt đầu.</p>
			</div>
		</div>
	);
};

export default PWaitingPage;
