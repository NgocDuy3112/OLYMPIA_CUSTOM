import { API_BASE_URL } from "@/configs";

export const calculateScore = async (
    token: string,
    matchCode: string,
    questionCode: string,
    action: string,
    userCodes: string[],
) => {
    const response = await fetch(`${API_BASE_URL}/scoreboard/calculate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
            match_code: matchCode,
            question_code: questionCode,
            action,
            user_codes: userCodes,
        }),
    });
    if (!response.ok) throw new Error("Không thể tính điểm");
    return response.json();
};
