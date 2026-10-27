import { describe, expect, it } from "vitest"
import { slugify } from "@/lib/slug"

// The stage id the dialog mints from its title (lib/slug). The bug this pins: the old
// slugify DELETED every non-[a-z0-9] character, so Vietnamese diacritics
// vanished ("Vòng bảng" → "v-ng-b-ng") or emptied the id entirely ("Đề" → "",
// tripping "Every stage needs an id."). Transliteration (NFD + đ→d) is the rule.

describe("slugify (stage id from title)", () => {
    it("transliterates Vietnamese instead of deleting it", () => {
        expect(slugify("Vòng bảng")).toBe("vong-bang")
        expect(slugify("Đề")).toBe("de")               // was "" — the reported error
        expect(slugify("Giải đấu Olympic")).toBe("giai-dau-olympic")
        expect(slugify("Đắk Lắk 2026")).toBe("dak-lak-2026")
        expect(slugify("Ưu tiên — Mùa 2")).toBe("uu-tien-mua-2")
    })

    it("leaves plain ASCII alone", () => {
        expect(slugify("Playoff")).toBe("playoff")
        expect(slugify("  Splitting   Round  ")).toBe("splitting-round")
        expect(slugify("Round-2")).toBe("round-2")
    })

    it("trims stray separators, keeps digits", () => {
        expect(slugify("---vòng---bảng---")).toBe("vong-bang")
        expect(slugify("Stage 1")).toBe("stage-1")
    })
})
