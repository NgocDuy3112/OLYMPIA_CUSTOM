/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { BaseAuthLayout } from "@/pages/auth/BaseAuthLayout";
import { InputField } from "@/components/auth/InputField";
import { API_BASE_URL } from "@/configs";



const SignupPage: React.FC = () => {
    const [form, setForm] = useState({ username: "", displayName: "", password: "" });
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const response = await fetch(`${API_BASE_URL}/auth/signup`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    username: form.username,
                    display_name: form.displayName,
                    password: form.password,
                    role: "player"
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || "Đăng ký thất bại");
            }

            alert("Đăng ký thành công!");
            navigate("/login");
        } catch (err: any) {
            alert(err.message);
        }
    };

    return (
        <BaseAuthLayout title="OLYMPIA CUSTOM 3" subtitle="Tạo tài khoản thí sinh">
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <InputField 
                    label="Username" 
                    value={form.username} 
                    onChange={(e: { target: { value: any; }; }) => setForm({ ...form, username: e.target.value })} 
                />
                <InputField 
                    label="Tên thí sinh" 
                    value={form.displayName} 
                    onChange={(e: { target: { value: any; }; }) => setForm({ ...form, displayName: e.target.value })} 
                />
                <InputField 
                    label="Mật khẩu" 
                    type="password" 
                    value={form.password} onChange={(e: { target: { value: any; }; }) => setForm({ ...form, password: e.target.value })} 
                />
                <button type="submit" className="mt-4 bg-red-600 hover:bg-red-500 text-white font-semibold py-2 rounded transition-all">
                    TẠO TÀI KHOẢN
                </button>
                <a href="/login" className="text-center text-sm underline opacity-80 hover:opacity-100">Đã có tài khoản? Click vào đây!</a>
            </form>
        </BaseAuthLayout>
    );
};


export default SignupPage;