import { LoginForm } from "@/components/login-form"

export function LoginPage() {
    return (
        <div className="flex min-h-[calc(100dvh-3.5rem)] items-center justify-center px-4 py-10">
            <div className="w-full max-w-3xl">
                <LoginForm />
            </div>
        </div>
    )
}