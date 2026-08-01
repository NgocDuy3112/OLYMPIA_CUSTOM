import { SignupForm } from "@/components/shared/SignupForm";

type SignupMode = "admin" | "player";

type SignupPageProps = {
    mode?: SignupMode;
    password?: boolean;
};

const signupConfigs = {
    player: {
        role: "player" as const,
        subtitle: "Tạo tài khoản thí sinh",
        nameLabel: "Tên thí sinh",
        successMessage: "Đăng ký thành công!",
        loginMessage: "Đã có tài khoản? Click vào đây!",
        description: "Mật khẩu sẽ được tự động sinh và gửi tới email bạn cung cấp.",
    },
    admin: {
        role: "admin" as const,
        subtitle: "Tạo tài khoản quản trị",
        nameLabel: "Tên quản trị",
        successMessage: "Admin account created successfully",
        loginMessage: "Đã có tài khoản admin? Click vào đây!",
        description: "Mã và mật khẩu đăng nhập sẽ được tự động sinh và gửi tới email được cung cấp.",
    },
};

const SignupPage = ({ mode = "player", password = false }: SignupPageProps) => {
    return <SignupForm {...signupConfigs[mode]} password={password} />;
};

export default SignupPage;
