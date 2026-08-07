import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { BaseAuthLayout } from "@/pages/auth/BaseAuthLayout";
import { InputField } from "@/components/shared/InputField";
import { API_BASE_URL } from "@/configs";

type SignupFormProps = {
    role: "admin" | "player";
    subtitle: string;
    nameLabel: string;
    successMessage: string;
    loginMessage: string;
    description?: string;
    password?: boolean;
};

export const SignupForm = ({
    role,
    subtitle,
    nameLabel,
    successMessage,
    loginMessage,
    description,
    password = false,
}: SignupFormProps) => {
    const [form, setForm] = useState({ email: "", userName: "", password: "" });
    const navigate = useNavigate();

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();
        try {
            const response = await fetch(`${API_BASE_URL}/auth/signup`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    user_name: form.userName,
                    email: form.email,
                    role,
                    ...(password && { password: form.password }),
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || errorData.message || "Đăng ký thất bại");
            }

            alert(successMessage);
            navigate("/login");
        } catch (error: unknown) {
            alert(error instanceof Error ? error.message : "Đăng ký thất bại");
        }
    };

    return (
        <BaseAuthLayout title="OLYMPIA CUSTOM 3" subtitle={subtitle}>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <InputField
                    label="Email"
                    type="email"
                    value={form.email}
                    onChange={(event) => setForm({ ...form, email: event.target.value })}
                />
                <InputField
                    label={nameLabel}
                    value={form.userName}
                    onChange={(event) => setForm({ ...form, userName: event.target.value })}
                />
                {password && (
                    <InputField
                        label="Mật khẩu"
                        type="password"
                        value={form.password}
                        onChange={(event) => setForm({ ...form, password: event.target.value })}
                    />
                )}
                {description && <p className="text-sm text-gray-300">{description}</p>}
                <button type="submit" className="mt-4 btn-primary-full">
                    {role === "admin" ? "TẠO TÀI KHOẢN ADMIN" : "TẠO TÀI KHOẢN"}
                </button>
                <a href="/login" className="text-center text-sm text-white underline opacity-80 hover:opacity-100">
                    {loginMessage}
                </a>
            </form>
        </BaseAuthLayout>
    );
};
