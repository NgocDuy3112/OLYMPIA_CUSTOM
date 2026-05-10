/**
 * VỀ ĐÍCH (About Round) Types
 *
 * Two variations:
 * - CHUNG (Joint): Pick 4 questions
 * - RIENG (Individual): Pick 3 questions
 */

export const VeDichRound = {
	CHUNG: 4,
	RIENG: 3,
} as const;

export type VeDichRound = (typeof VeDichRound)[keyof typeof VeDichRound];

/**
 * Get human-readable label for VeDichRound
 * @param round - VeDichRound enum value
 * @returns Vietnamese label
 */
export const getVeDichRoundLabel = (round: VeDichRound): string => {
	switch (round) {
		case VeDichRound.CHUNG:
			return "VỀ ĐÍCH - LƯỢT CHUNG";
		case VeDichRound.RIENG:
			return "VỀ ĐÍCH - LƯỢT CÁ NHÂN";
		default:
			return "VỀ ĐÍCH";
	}
};

/**
 * Get route path for VeDichRound
 * @param round - VeDichRound enum value
 * @param matchCode - Match code
 * @returns Route path
 */
export const getVeDichRoutePath = (round: VeDichRound, matchCode: string): string => {
	const roundPath = round === VeDichRound.CHUNG ? "vdc" : "vdr";
	return `/admin/${roundPath}/pick/${matchCode}`;
};
