import { describe, expect, it } from "vitest";
import {
  assignAutoCodes,
  autoCodePrefixes,
  nextSequentialSetCode,
  normalizeRows,
  stripAccents,
  validateGmSets,
  validateRow,
  vnDate,
  type RawItem,
} from "../src/modules/question/bank-import.js";

const today = "01012026";

function item(
  sheet: string,
  row: number,
  cells: Record<string, unknown>,
): RawItem {
  return { sheet, row, cells };
}

describe("normalizeRows — template OC_BANK (cột tiếng Việt, name-based)", () => {
  it("KHOI_DONG: Lượt Chung/Riêng → KD_C/KD_R, trống → mặc định sheet", () => {
    const { rows } = normalizeRows([
      item("KHOI_DONG", 2, { Lượt: "Riêng", "Câu hỏi": "Q1", "Đáp án": "A1" }),
      item("KHOI_DONG", 3, { Lượt: "Chung", "Câu hỏi": "Q2", "Đáp án": "A2" }),
      item("KHOI_DONG", 4, { "Câu hỏi": "Q3", "Đáp án": "A3" }),
    ]);
    expect(rows[0].fields.roundHint).toBe("KD_R");
    expect(rows[1].fields.roundHint).toBe("KD_C");
    expect(rows[2].fields.roundHint).toBe("KD_C");
    expect(rows[0].fields.content).toBe("Q1");
    expect(rows[0].fields.answer).toBe("A1");
  });

  it("GIAI_MA: Đáp án câu hỏi/Gợi ý/Mã gợi ý/Bộ gợi ý map đúng, sheet → GM", () => {
    const { rows } = normalizeRows([
      item("GIAI_MA", 2, {
        "Mã gợi ý": "KEY",
        "Bộ gợi ý": "s1",
        "Câu hỏi": "Từ khoá",
        "Đáp án câu hỏi": "Hà Nội",
        "Gợi ý": "None",
        "Giải thích": "CNV",
        "File ảnh/video/audio": "None",
      }),
      item("GIAI_MA", 3, {
        "Mã gợi ý": "h3",
        "Bộ gợi ý": "s1",
        "Câu hỏi": "Q",
        "Đáp án câu hỏi": "A",
        "Gợi ý": "gợi mở",
      }),
    ]);
    expect(rows[0].fields.roundHint).toBe("GM");
    expect(rows[0].fields.answer).toBe("Hà Nội");
    expect(rows[0].fields.hintText).toBeUndefined();
    expect(rows[0].fields.mediaUrl).toBeUndefined();
    expect(rows[0].mediaWarning).toBeUndefined();
    expect(rows[0].fields.setCode).toBe("S1");
    expect(rows[1].fields.hintIndex).toBe("H3");
    expect(rows[1].fields.hintText).toBe("gợi mở");
  });

  it("VE_DICH: Lĩnh vực/Mức điểm map domain + difficulty (string → number)", () => {
    const { rows } = normalizeRows([
      item("VE_DICH", 2, {
        "Lĩnh vực": "thth",
        "Mức điểm": "30",
        "Câu hỏi": "Q",
        "Đáp án": "A",
      }),
    ]);
    expect(rows[0].fields.domain).toBe("THTH");
    expect(rows[0].fields.difficulty).toBe(30);
    expect(rows[0].fields.roundHint).toBe("VD");
  });

  it("media: URL → mediaUrl; tên file → warning + bỏ mediaUrl", () => {
    const { rows } = normalizeRows([
      item("BUT_PHA", 2, {
        "Câu hỏi": "Q1",
        "Đáp án": "A1",
        "File ảnh/video/audio": "https://cdn.x/anh.png",
      }),
      item("BUT_PHA", 3, {
        "Câu hỏi": "Q2",
        "Đáp án": "A2",
        "File ảnh/video/audio": "anh2.png",
      }),
    ]);
    expect(rows[0].fields.mediaUrl).toBe("https://cdn.x/anh.png");
    expect(rows[0].mediaWarning).toBeUndefined();
    expect(rows[1].fields.mediaUrl).toBeUndefined();
    expect(rows[1].mediaWarning?.file).toBe("anh2.png");
  });

  it("rows field-name (model paste) — không cần sheet, accent-insensitive header", () => {
    const { rows } = normalizeRows([
      {
        row: 1,
        cells: {
          Content: "Q",
          Answer: "A",
          roundHint: "kd_r",
        },
      },
    ]);
    expect(rows[0].fields.content).toBe("Q");
    expect(rows[0].fields.roundHint).toBe("KD_R");
    expect(stripAccents("Đáp án")).toBe("Dap an");
  });

  it("sheet lạ + thiếu Vòng → issue, không đoán", () => {
    const { rows, issues } = normalizeRows([
      item("RANDOM", 2, { "Câu hỏi": "Q", "Đáp án": "A" }),
    ]);
    expect(rows).toHaveLength(0);
    expect(issues).toHaveLength(1);
    expect(issues[0].sheet).toBe("RANDOM");
  });
});

describe("validateRow", () => {
  const base = { row: 2, sheet: "S", fields: { content: "Q", answer: "A" } };

  it("hợp lệ →0 lỗi", () => {
    expect(validateRow(base)).toHaveLength(0);
  });

  it("thiếu content/answer →2 lỗi", () => {
    const errs = validateRow({ row: 3, fields: {} });
    expect(errs.map((e) => e.field)).toEqual(["content", "answer"]);
  });

  it("domain/mức điểm/mã gợi ý/bankCode sai → lỗi từng ô", () => {
    const errs = validateRow({
      row: 4,
      fields: {
        content: "Q",
        answer: "A",
        domain: "XYZ",
        difficulty: 25,
        hintIndex: "H9",
        bankCode: "NO_QB",
      },
    });
    expect(errs.map((e) => e.field).sort()).toEqual([
      "bankCode",
      "difficulty",
      "domain",
      "hintIndex",
    ]);
  });
});

describe("assignAutoCodes — QB_<ROUND>_<DDMMYYYY>_<NN>", () => {
  it("tiếp tục sau MAX hiện có, giữ code có sẵn, tokenize round", () => {
    const existing = [
      `QB_KDC_${today}_01`,
      `QB_KDC_${today}_07`,
      `QB_VD_${today}_02`,
      `QB_KDC_31122025_99`,
    ];
    const { rows } = normalizeRows([
      item("KHOI_DONG", 2, { "Câu hỏi": "Q1", "Đáp án": "A1" }),
      item("KHOI_DONG", 3, { "Câu hỏi": "Q2", "Đáp án": "A2" }),
      item("VE_DICH", 4, { "Câu hỏi": "Q3", "Đáp án": "A3" }),
      item("BUT_PHA", 5, {
        "Câu hỏi": "Q4",
        "Đáp án": "A4",
        bankCode: "QB_BP_01012026_55",
      }),
    ]);
    assignAutoCodes(rows, existing, today);
    expect(rows[0].fields.bankCode).toBe(`QB_KDC_${today}_08`);
    expect(rows[1].fields.bankCode).toBe(`QB_KDC_${today}_09`);
    expect(rows[2].fields.bankCode).toBe(`QB_VD_${today}_03`);
    expect(rows[3].fields.bankCode).toBe("QB_BP_01012026_55");
  });

  it("autoCodePrefixes chỉ cho rows thiếu code,1 prefix/round", () => {
    const { rows } = normalizeRows([
      item("KHOI_DONG", 2, { "Câu hỏi": "Q1", "Đáp án": "A1" }),
      item("KHOI_DONG", 3, { "Câu hỏi": "Q2", "Đáp án": "A2" }),
      item("VE_DICH", 4, {
        "Câu hỏi": "Q3",
        "Đáp án": "A3",
        bankCode: "QB_VD_01012026_01",
      }),
    ]);
    expect(autoCodePrefixes(rows, today)).toEqual([`QB_KDC_${today}_`]);
  });

  it("vnDate =8 chữ số", () => {
    expect(vnDate()).toMatch(/^\d{8}$/);
  });
});

describe("validateGmSets — GIAI_MA gom set theo hợp đồng pick-gm-set", () => {
  function gmRows(spec: Array<{ hint: string; set?: string }>): RawItem[] {
    return spec.map((s, i) =>
      item("GIAI_MA", 2 + i, {
        "Mã gợi ý": s.hint,
        ...(s.set !== undefined ? { "Bộ gợi ý": s.set } : {}),
        "Câu hỏi": s.hint === "KEY" ? "Từ khoá" : `Q ${s.hint}`,
        "Đáp án câu hỏi": "A",
      }),
    );
  }
  const FULL = ["KEY", "H1", "H2", "H3", "H4", "H5", "H6", "H7", "H8"];

  it("set đủ KEY + H1..H8 →0 issue", () => {
    const { rows } = normalizeRows(gmRows(FULL.map((h) => ({ hint: h, set: "S1" }))));
    expect(validateGmSets(rows)).toHaveLength(0);
  });

  it("thiếu H5 → issue cho TỪNG row của set (chặn cả set)", () => {
    const { rows } = normalizeRows(
      gmRows(FULL.filter((h) => h !== "H5").map((h) => ({ hint: h, set: "S1" }))),
    );
    const issues = validateGmSets(rows);
    expect(issues).toHaveLength(8);
    expect(issues[0].msg).toContain("thiếu H5");
  });

  it("trùng H2 → issue cả set (Map overwrite-im lặng được chặn)", () => {
    const { rows } = normalizeRows(
      gmRows([...FULL, "H2"].map((h) => ({ hint: h, set: "S2" }))),
    );
    const issues = validateGmSets(rows);
    expect(issues).toHaveLength(10);
    expect(issues[0].msg).toContain("trùng H2");
  });

  it("thiếu KEY → issue cả set", () => {
    const { rows } = normalizeRows(
      gmRows(FULL.filter((h) => h !== "KEY").map((h) => ({ hint: h, set: "S3" }))),
    );
    const issues = validateGmSets(rows);
    expect(issues).toHaveLength(8);
    expect(issues[0].msg).toContain("thiếu KEY");
  });

  it("thiếu Bộ gợi ý / Mã gợi ý → lỗi row-level", () => {
    const { rows } = normalizeRows([
      item("GIAI_MA", 2, {
        "Bộ gợi ý": "S9",
        "Câu hỏi": "Q1",
        "Đáp án câu hỏi": "A1",
      }),
      item("GIAI_MA", 3, { "Câu hỏi": "Q2", "Đáp án câu hỏi": "A2" }),
    ]);
    const fields = validateGmSets(rows).map((i) => i.field);
    expect(fields).toContain("hintIndex");
    expect(fields).toContain("setCode");
  });

  it("set khác không liên quan vấn đề của nhau", () => {
    const { rows } = normalizeRows(
      gmRows([
        ...FULL.map((h) => ({ hint: h, set: "OK" })),
        { hint: "KEY", set: "BROKEN" },
      ]),
    );
    const issues = validateGmSets(rows);
    expect(issues).toHaveLength(1);
    expect(issues[0].msg).toContain("set BROKEN");
  });

  it("không có row GM →0 issue", () => {
    const { rows } = normalizeRows([
      item("BUT_PHA", 2, { "Câu hỏi": "Q", "Đáp án": "A" }),
    ]);
    expect(validateGmSets(rows)).toHaveLength(0);
  });
});

describe("nextSequentialSetCode — S tăng tiến, không hash", () => {
  it("trống → S1", () => {
    expect(nextSequentialSetCode([])).toBe("S1");
  });

  it("MAX +1, bỏ qua SET_<hash> cũ", () => {
    expect(
      nextSequentialSetCode(["S1", "S3", "SET_1Z9KQQ", "S09"]),
    ).toBe("S10");
  });

  it("chỉ nhận S<digits>", () => {
    expect(nextSequentialSetCode(["SET_XX", "SX", "S2a"])).toBe("S1");
  });
});
