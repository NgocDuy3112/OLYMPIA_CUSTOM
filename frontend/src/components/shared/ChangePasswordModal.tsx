import { useState } from "react";
import { X, KeyRound } from "lucide-react";
import { API_BASE_URL } from "@/configs";

interface ChangePasswordModalProps {
    token: string;
    onClose: () => void;
}

const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({ token, onClose }) => {
    const [oldPassword, setOldPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        if (newPassword !== confirmPassword) {
            setError("Mật khẩu mới không khớp.");
            return;
        }
        if (newPassword.length < 6) {
            setError("Mật khẩu mới phải có ít nhất 6 ký tự.");
            return;
        }

        setLoading(true);
        try {
            const res = await fetch(`${API_BASE_URL}/auth/change-password`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
            });
            const json = await res.json();
            if (json.status === "success") {
                setSuccess(true);
            } else {
                setError(json.detail ?? json.message ?? "Đổi mật khẩu thất bại.");
            }
        } catch {
            setError("Lỗi kết nối. Vui lòng thử lại.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-blue-950 border border-blue-700 rounded-xl p-6 w-full max-w-sm shadow-2xl">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="flex items-center gap-2 text-lg font-bold text-blue-200">
                        <KeyRound size={18} /> Đổi mật khẩu
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-1 rounded hover:bg-blue-800 transition-colors text-blue-400"
                    >
                        <X size={18} />
                    </button>
                </div>

                {success ? (
                    <div className="text-center py-4">
                        <p className="text-blue-400 font-semibold mb-4">Đổi mật khẩu thành công!</p>
                        <button
                            onClick={onClose}
                            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 font-medium"
                        >
                            Đóng
                        </button>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
                        <input
                            type="password"
                            placeholder="Mật khẩu hiện tại"
                            value={oldPassword}
                            onChange={(e) => setOldPassword(e.target.value)}
                            required
                            className="px-3 py-2 rounded-lg bg-blue-900 border border-blue-700 text-white placeholder-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        />
                        <input
                            type="password"
                            placeholder="Mật khẩu mới (tối thiểu 6 ký tự)"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            required
                            className="px-3 py-2 rounded-lg bg-blue-900 border border-blue-700 text-white placeholder-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        />
                        <input
                            type="password"
                            placeholder="Xác nhận mật khẩu mới"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            required
                            className="px-3 py-2 rounded-lg bg-blue-900 border border-blue-700 text-white placeholder-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        />
                        {error && <p className="text-red-400 text-sm">{error}</p>}
                        <button
                            type="submit"
                            disabled={loading}
                            className="mt-1 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 font-semibold transition-colors"
                        >
                            {loading ? "Đang xử lý..." : "Xác nhận đổi mật khẩu"}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
};

export default ChangePasswordModal;
