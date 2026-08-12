
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { InputField } from "@/components/shared/InputField";
import { BaseAuthLayout } from "@/pages/auth/BaseAuthLayout";
import { API_BASE_URL } from "@/configs";
import type { AuthSessionData } from "@/utils/authSession";
import { saveAuthSession } from "@/utils/authSession";

const LoginPage: React.FC = () => {
    const [credentials, setCredentials] = useState({ username: "", password: "" });
    const navigate = useNavigate();

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

            const data = await response.json() as AuthSessionData & { detail?: string };
            if (!response.ok) throw new Error(data.detail || "Đăng nhập thất bại");

            saveAuthSession(data, navigate);
        } catch (error: unknown) {
            alert(error instanceof Error ? error.message : "Đăng nhập thất bại");
        }
    };

    return (
        <BaseAuthLayout title="OLYMPIA CUSTOM 3" subtitle="Đăng nhập">
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <InputField
                    label="Tên / Mã thí sinh / Email"
                    name="username"
                    value={credentials.username} onChange={handleChange}
                    placeholder="Nhập tên, mã hoặc email"
                />
                <InputField
                    label="Mật khẩu"
                    name="password"
                    type="password"
                    value={credentials.password} onChange={handleChange}
                />
                <button type="submit" className="mt-4 btn-primary-full">
                    ĐĂNG NHẬP
                </button>
            </form>
        </BaseAuthLayout>
    );
};

export default LoginPage;