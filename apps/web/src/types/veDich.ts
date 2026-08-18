export const VeDichRound = {
  CHUNG: 4,
  RIENG: 3,
} as const;

export type VeDichRound = (typeof VeDichRound)[keyof typeof VeDichRound];

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

export const getVeDichRoutePath = (
  round: VeDichRound,
  matchCode: string,
): string => {
  const roundPath = round === VeDichRound.CHUNG ? "vdc" : "vdr";
  return `/admin/${roundPath}/pick/${matchCode}`;
};
