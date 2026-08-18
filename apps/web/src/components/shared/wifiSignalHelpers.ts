export function latencyToBars(
  ms: number | null | undefined,
): 0 | 1 | 2 | 3 | 4 {
  if (ms == null) return 0;
  if (ms < 100) return 4;
  if (ms < 300) return 3;
  if (ms < 800) return 2;
  return 1;
}

export function latencyToColorClass(ms: number | null | undefined): string {
  const bars = latencyToBars(ms);
  switch (bars) {
    case 4:
      return "text-green-400";
    case 3:
      return "text-lime-400";
    case 2:
      return "text-amber-400";
    case 1:
      return "text-red-400";
    default:
      return "text-gray-500";
  }
}
