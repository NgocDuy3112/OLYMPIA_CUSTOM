import { describe, expect, it } from "vitest";
import { slugify } from "../../../src/modules/tournaments/slug.js";


describe("slugify (tournament name → url slug)", () => {
    it("transliterates Vietnamese instead of deleting it", () => {
        expect(slugify("Giải đấu Olympic")).toBe("giai-dau-olympic");
        expect(slugify("Đường phố")).toBe("duong-pho");
        expect(slugify("Đắk Lắk 2026")).toBe("dak-lak-2026");
    });

    it("leaves ASCII alone and trims separators", () => {
        expect(slugify("Tournament One")).toBe("tournament-one");
        expect(slugify("  Same   Name  ")).toBe("same-name");
        expect(slugify("---")).toBe("");   
    });

    it("stays inside the public URL's pattern (^[a-z0-9-]{1,100}$)", () => {
        for (const name of ["Vòng bảng", "Đề", "Đường phố", "Ưu tiên — Mùa 2"]) {
            expect(slugify(name)).toMatch(/^[a-z0-9-]{1,100}$/);
        }
    });
});
