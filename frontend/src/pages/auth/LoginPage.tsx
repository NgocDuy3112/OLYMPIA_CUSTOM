/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState } from "react";
import { InputField } from "@/components/auth/InputField";
import { BaseAuthLayout }from "@/pages/auth/BaseAuthLayout";
import { useAuthSession } from "@/hooks/useAuthSession";
import { API_BASE_URL } from "@/configs";


const LoginPage: React.FC = () => {
    const [credentials, setCredentials] = useState({ username: "", password: "" });
    const { saveSession } = useAuthSession();

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setCredentials(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const formData = new URLSearchParams(credentials);
            const response = await fetch(`${API_BASE_URL}/auth/login`, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: formData.toString(),
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.detail || "Đăng nhập thất bại");

            saveSession(data);
        } catch (err: any) {
            alert(err.message);
        }
    };

    return (
        <BaseAuthLayout title="OLYMPIA CUSTOM 3" subtitle="Đăng nhập vào game">
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <InputField 
                    label="Username" 
                    name="username" 
                    value={credentials.username} onChange={handleChange} 
                />
                <InputField 
                    label="Mật khẩu" 
                    name="password" 
                    type="password" 
                    value={credentials.password} onChange={handleChange} 
                />
                <button type="submit" className="mt-4 bg-red-600 hover:bg-red-500 text-white font-semibold py-2 rounded transition-all">
                    ĐĂNG NHẬP
                </button>
                <a href="/signup" className="text-center text-sm underline opacity-80 hover:opacity-100">Chưa có tài khoản? Click vào đây!</a>
            </form>
        </BaseAuthLayout>
    );
};


export default LoginPage;