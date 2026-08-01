export interface AuthSessionData {
  access_token: string;
  role: string;
  user_code?: string;
}

export function saveAuthSession(data: AuthSessionData, navigate: (path: string) => void): void {
  const { access_token: token, role, user_code: userCode = "" } = data;
  localStorage.clear();
  sessionStorage.clear();

  if (role === "admin") {
    localStorage.setItem("jwtToken_admin", token);
    localStorage.setItem("role", role);
    navigate("/admin/game-managing");
    return;
  }

  if (role === "mc") {
    sessionStorage.setItem("jwtToken_mc", token);
    sessionStorage.setItem("role", role);
    sessionStorage.setItem("mcCode", userCode);
    navigate("/mc/access");
    return;
  }

  sessionStorage.setItem("jwtToken_player", token);
  sessionStorage.setItem("role", role);
  sessionStorage.setItem("playerCode", userCode);
  navigate("/player/access");
}
