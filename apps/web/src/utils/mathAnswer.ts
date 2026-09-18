// Chuẩn hoá đáp án toán để so sánh tương đương.
// Không thay engine chấm — chỉ dùng gợi ý + review.

function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeSpaces(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

// "x=2" -> "2", "S = 1/2" -> "1/2"
function stripLeftSide(s: string): string {
  const idx = s.indexOf("=");
  if (idx > 0 && idx < s.length - 1) {
    const left = s.slice(0, idx).trim();
    // Chỉ bỏ vế trái nếu ngắn (tên biến), giữ nguyên nếu cả 2 vế dài.
    if (/^[a-zA-Z][a-zA-Z0-9_]{0,3}$/.test(left)) return s.slice(idx + 1).trim();
  }
  return s;
}

function normalizeFraction(s: string): string {
  // "1/2" giữ nguyên; "0.5" cũng giữ — so sánh số ở bước sau.
  return s;
}

function toNumberOrNull(s: string): number | null {
  // Hỗ trợ "1/2", "3,5", "-2", "0.5", "50%"
  let t = s.replace(",", ".").trim();
  let isPercent = false;
  if (t.endsWith("%")) {
    isPercent = true;
    t = t.slice(0, -1).trim();
  }
  const frac = t.match(/^(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)$/);
  if (frac) {
    const denom = Number(frac[2]);
    if (denom === 0) return null;
    const v = Number(frac[1]) / denom;
    return isPercent ? v / 100 : v;
  }
  if (/^-?\d+(?:\.\d+)?$/.test(t)) {
    const v = Number(t);
    return isPercent ? v / 100 : v;
  }
  return null;
}

export function normalizeMathAnswer(raw: string): string {
  let s = normalizeSpaces(raw);
  s = stripLeftSide(s);
  s = normalizeFraction(s);
  // Lowercase + bỏ dấu cho đáp án chữ, giữ số nguyên.
  const num = toNumberOrNull(s);
  if (num !== null) return `num:${num}`;
  return `txt:${stripDiacritics(s).toLowerCase()}`;
}

export function mathAnswersEqual(a: string, b: string): boolean {
  const na = normalizeMathAnswer(a);
  const nb = normalizeMathAnswer(b);
  if (na.startsWith("num:") && nb.startsWith("num:")) {
    return Math.abs(Number(na.slice(4)) - Number(nb.slice(4))) < 1e-9;
  }
  return na === nb;
}
