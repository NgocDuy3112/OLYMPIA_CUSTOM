import { SignupForm } from "@/components/shared/SignupForm";

type SignupMode = "admin" | "player";

type SignupPageProps = {
    mode?: SignupMode;
};

const signupConfigs = {
    player: {
        role: "player" as const,
        subtitle: "Tạo tài khoản thí sinh",
        nameLabel: "Tên thí sinh",
        successMessage: "Đăng ký thành công!",
        loginMessage: "Đã có tài khoản? Click vào đây!",
        description: "Mật khẩu do bạn tự đặt.",
    },
    admin: {
        role: "admin" as const,
        subtitle: "Tạo tài khoản quản trị",
        nameLabel: "Tên quản trị",
        successMessage: "Admin account created successfully",
        loginMessage: "Đã có tài khoản admin? Click vào đây!",
        description: "Mã đăng nhập được tự động sinh; mật khẩu do bạn tự đặt.",
    },
};

const SignupPage = ({ mode = "player" }: SignupPageProps) => {
    return <SignupForm {...signupConfigs[mode]} />;
};

export default SignupPage;
