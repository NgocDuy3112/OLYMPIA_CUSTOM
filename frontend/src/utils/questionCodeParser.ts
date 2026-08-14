export interface ParsedQuestionCode {
    phase: string;
    phaseLabel: string;
    category?: string;
    questionLabel: string;
    sortOrder: number;
}

const phaseLabels: Record<string, string> = {
    KD: "Khởi động",
    GM: "Giải mã",
    BP: "Bứt phá",
    VD: "Về đích",
};

const categoryLabels: Record<string, string> = {
    TTTK: "TOÁN HỌC - TIN HỌC",
	TNSS: "TỰ NHIÊN - SỰ SỐNG",
	XHPL: "KINH TẾ - XÃ HỘI",
	NTNV: "VĂN HỌC - NGHỆ THUẬT",
	VHTT: "VĂN HÓA - THỂ THAO",
	KTTH: "KIẾN THỨC TỔNG HỢP"
};

export function parseQuestionCode(questionCode: string): ParsedQuestionCode {
    const parts = questionCode.split("_");
    const phase = parts[2] ?? "UNKNOWN";
    const phaseLabel = phaseLabels[phase] ?? "Câu hỏi khác";

    if (phase === "KD" && parts[3] === "C" && parts[4]) {
        return { phase, phaseLabel, questionLabel: `Lượt chung · Câu ${parts[4]}`, sortOrder: Number(parts[4]) || 0 };
    }

    if (phase === "KD" && parts[3] && parts[4]) {
        return { phase, phaseLabel, questionLabel: `Lượt cá nhân ${parts[3]} · Câu ${parts[4]}`, sortOrder: Number(parts[3]) * 100 + (Number(parts[4]) || 0) };
    }

    if (phase === "GM" && parts[3] === "KEY") {
        return { phase, phaseLabel, questionLabel: "Từ khoá", sortOrder: 9999 };
    }

    if (phase === "GM" && parts[3]) {
        return { phase, phaseLabel, questionLabel: `Gợi ý ${parts[3]}`, sortOrder: Number(parts[3]) || 0 };
    }

    if (phase === "BP" && parts[3]) {
        return { phase, phaseLabel, questionLabel: `Câu ${parts[3]}`, sortOrder: Number(parts[3]) || 0 };
    }

    if (phase === "VD" && parts[3] && parts[4]) {
        const category = categoryLabels[parts[3]] ?? parts[3];
        const points = Number(parts[4]);
        return {
            phase,
            phaseLabel,
            category,
            questionLabel: `${category} · ${points || 0} điểm`,
            sortOrder: Number.isFinite(points) ? points : 0,
        };
    }

    return { phase, phaseLabel, questionLabel: questionCode, sortOrder: 0 };
}
