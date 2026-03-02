import { useNavigate } from "react-router-dom";


export const useAuthSession = () => {
    const navigate = useNavigate();

    const saveSession = (data: { access_token: string; role: string; user_code?: string }) => {
        const { access_token, role, user_code } = data;

        // Clear previous sessions
        localStorage.clear();
        sessionStorage.clear();

        if (role === "admin") {
            localStorage.setItem("jwtToken_admin", access_token);
            localStorage.setItem("role", role);
            navigate("/admin/game-managing");
        } else {
            sessionStorage.setItem("jwtToken_player", access_token);
            sessionStorage.setItem("role", role);
            sessionStorage.setItem("playerCode", user_code || "");
            navigate("/player/access");
        }
    };

    return { saveSession };
};