import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { BaseAuthLayout } from "@/pages/auth/BaseAuthLayout";
import { InputField } from "@/components/shared/InputField";
import { API_BASE_URL } from "@/configs";

const ResetPasswordPage: React.FC = () => {
    const { search } = useLocation();
    const params = new URLSearchParams(search);
    const token = params.get("token") || "";
    const navigate = useNavigate();

    const [password, setPassword] = useState("");
    const [password2, setPassword2] = useState("");
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (password.length < 6) return alert("Mật khẩu phải có ít nhất 6 ký tự");
        if (password !== password2) return alert("Mật khẩu không khớp");
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE_URL}/auth/reset-password`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token, new_password: password }),
            });
            const body = await res.json();
            if (!res.ok) throw new Error(body.detail || "Lỗi");
            alert("Mật khẩu đã được cập nhật. Vui lòng đăng nhập.");
            navigate("/login");
        } catch (err: any) {
            alert(err.message || String(err));
        } finally {
            setLoading(false);
        }
    };

    return (
        <BaseAuthLayout title="OLYMPIA CUSTOM 3" subtitle="Đặt lại mật khẩu">
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <InputField label="Mật khẩu mới" type="password" value={password} onChange={(e: any) => setPassword(e.target.value)} />
                <InputField label="Nhập lại mật khẩu" type="password" value={password2} onChange={(e: any) => setPassword2(e.target.value)} />
                <button type="submit" disabled={loading} className="mt-4 btn-primary-full">
                    {loading ? "Đang gửi…" : "CẬP NHẬT MẬT KHẨU"}
                </button>
                <a href="/login" className="text-center text-sm text-white underline opacity-80 hover:opacity-100">Quay lại đăng nhập</a>
            </form>
        </BaseAuthLayout>
    );
};

export default ResetPasswordPage;
