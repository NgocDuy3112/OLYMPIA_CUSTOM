/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { BaseAuthLayout } from "@/pages/auth/BaseAuthLayout";
import { InputField } from "@/components/shared/InputField";
import { API_BASE_URL } from "@/configs";

// NOTE: Admin signup typically should be restricted (invitation or approval).
// This form will set role="admin" when creating account. Consider gating this.

const AdminSignupPage: React.FC = () => {
    const [form, setForm] = useState({ email: "", userName: "" });
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const response = await fetch(`${API_BASE_URL}/auth/signup`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    user_name: form.userName,
                    email: form.email,
                    role: "admin"
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || "Đăng ký thất bại");
            }

            alert("Admin account created successfully");
            navigate("/login");
        } catch (err: any) {
            alert(err.message);
        }
    };

    return (
        <BaseAuthLayout title="OLYMPIA CUSTOM 3" subtitle="Tạo tài khoản quản trị">
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <InputField 
                    label="Email" 
                    type="email"
                    value={form.email} 
                    onChange={(e: { target: { value: any; }; }) => setForm({ ...form, email: e.target.value })} 
                />
                <InputField 
                    label="Tên quản trị" 
                    value={form.userName} 
                    onChange={(e: { target: { value: any; }; }) => setForm({ ...form, userName: e.target.value })} 
                />
                <p className="text-sm text-gray-300">Mã và mật khẩu đăng nhập sẽ được tự động sinh và gửi tới email được cung cấp.</p>
                <button type="submit" className="mt-4 btn-primary-full">
                    TẠO TÀI KHOẢN ADMIN
                </button>
                <a href="/login" className="text-center text-sm text-white underline opacity-80 hover:opacity-100">Đã có tài khoản admin? Click vào đây!</a>
            </form>
        </BaseAuthLayout>
    );
};


export default AdminSignupPage;
