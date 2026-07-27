import { useNavigate } from "react-router-dom";

export const useAuthSession = () => {
    const navigate = useNavigate();

    const saveSession = (data: { access_token: string; role: string; user_code?: string }) => {
        const { access_token, role, user_code } = data;

        localStorage.clear();
        sessionStorage.clear();

        if (role === "admin") {
            localStorage.setItem("jwtToken_admin", access_token);
            localStorage.setItem("role", role);
            navigate("/admin/game-managing");
        } else if (role === "mc") {
            sessionStorage.setItem("jwtToken_mc", access_token);
            sessionStorage.setItem("role", role);
            sessionStorage.setItem("mcCode", user_code || "");
            navigate("/mc/access");
        } else {
            sessionStorage.setItem("jwtToken_player", access_token);
            sessionStorage.setItem("role", role);
            sessionStorage.setItem("playerCode", user_code || "");
            navigate("/player/access");
        }
    };

    return { saveSession };
};