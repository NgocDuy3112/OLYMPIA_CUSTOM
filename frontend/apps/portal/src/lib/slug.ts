// The id a stage gets from its title: what the staff type when they place a match.
//
// Pure (no React) so the dialog keeps its fast-refresh surface and the unit
// tests can pin it directly. Vietnamese first: NFD decomposition strips the
// accents (ỏ → o, ề → e, ơ/ư → o/u), and đ is a real letter with no
// decomposition, so it maps by hand — DELETING the characters instead would
// mangle the title ("Vòng bảng" → "v-ng-b-ng") or empty it ("Đề" → ""), which
// tripped the dialog's "Every stage needs an id."
export function slugify(title: string): string {
    return title
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[đĐ]/g, "d")
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
}
