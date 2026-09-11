/** Map URL path to game phase code (shared by nav bar and page layouts). */
export function getPhaseFromPath(pathname: string): string {
  if (pathname.includes("/kdc")) return "kdc";
  if (pathname.includes("/kdr")) return "kdr";
  if (pathname.includes("/bp")) return "bp";
  if (pathname.includes("/vdc")) return "vdc";
  if (pathname.includes("/vdr")) return "vdr";
  if (pathname.includes("/gm")) return "gm";
  if (pathname.includes("/vl")) return "vl";
  if (pathname.includes("/waiting")) return "waiting";
  return "";
}
