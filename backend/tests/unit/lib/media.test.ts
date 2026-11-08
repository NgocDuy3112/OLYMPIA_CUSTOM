import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
    delete process.env.S3_ENDPOINT;
    delete process.env.S3_BUCKET;
    delete process.env.S3_ACCESS_KEY_ID;
    delete process.env.S3_SECRET_ACCESS_KEY;
});

import { findAttachment, kindFor, storeMedia } from "../../../src/lib/media.js";

describe("kindFor — what a file claims to be", () => {
    it("reads the extension first", () => {
        expect(kindFor("anh.png")).toBe("image");
        expect(kindFor("AM-04.MP3")).toBe("audio");
        expect(kindFor("clip.mov")).toBe("video");
    });

    it("falls back to the part's MIME type when the name says nothing", () => {
        expect(kindFor("banner", "image/webp")).toBe("image");
        expect(kindFor("recording", "audio/mpeg")).toBe("audio");
    });

    it("returns nothing rather than guessing", () => {
        expect(kindFor("File 1")).toBeNull();
        expect(kindFor("notes.pdf", "application/pdf")).toBeNull();
    });
});

describe("findAttachment — the cell points at a bundled file", () => {
    const bundled = [
        { filename: "media/Anh.PNG", content: Buffer.alloc(0) },
        { filename: "file 1.mp3", content: Buffer.alloc(0) }
    ];

    it("matches on the basename, ignoring case", () => {
        expect(findAttachment(bundled, "anh.png")?.filename).toBe("media/Anh.PNG");
    });

    it("matches when the cell carries a path of its own", () => {
        expect(findAttachment(bundled, "somewhere/FILE 1.MP3")?.filename).toBe("file 1.mp3");
    });

    it("finds nothing for a file that was not bundled", () => {
        expect(findAttachment(bundled, "khong-co.png")).toBeUndefined();
    });
});

describe("storeMedia — the two refusals", () => {
    it("refuses a name that implies no media type", async () => {
        await expect(
            storeMedia({ filename: "File 1", content: Buffer.alloc(1) })
        ).rejects.toThrow(/names no media type/);
    });

    it("refuses when storage is not configured — the import turns this into a row error", async () => {
        await expect(
            storeMedia({ filename: "anh.png", content: Buffer.alloc(1) })
        ).rejects.toThrow(/not configured/);
    });
});
