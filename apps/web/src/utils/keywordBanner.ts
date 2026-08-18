const LETTERS_PATTERN = /^[A-ZÀ-Ỹa-zà-ỹ]+$/u;
const DIGITS_PATTERN = /^\d+$/;

export function buildKeywordBanner(answer: string): string {
  const value = answer.replaceAll(" ", "");
  if (LETTERS_PATTERN.test(value))
    return `TỪ KHOÁ GỒM CÓ ${value.length} CHỮ CÁI`;
  if (DIGITS_PATTERN.test(value))
    return `TỪ KHOÁ GỒM CÓ ${value.length} CHỮ SỐ`;
  return `TỪ KHOÁ GỒM CÓ ${value.length} KÝ TỰ`;
}
