import { randomUUID } from "node:crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "../config/env.js";

export type MediaKind = "image" | "audio" | "video";

export interface StoredMedia {
    url: string;
    type: MediaKind;
}

export interface MediaAttachment {
    filename: string;
    contentType?: string;
    content: Buffer;
}

const KIND_BY_EXTENSION: Record<string, MediaKind> = {
    png: "image", jpg: "image", jpeg: "image", gif: "image", webp: "image",
    bmp: "image", svg: "image", heic: "image",
    mp3: "audio", wav: "audio", ogg: "audio", m4a: "audio", aac: "audio",
    flac: "audio", opus: "audio",
    mp4: "video", webm: "video", mov: "video", mkv: "video", avi: "video",
    m4v: "video"
};

function basename(value: string): string {
    return value.split(/[\\/]/).pop() ?? value;
}

function extensionOf(filename: string): string {
    const name = basename(filename);
    const dot = name.lastIndexOf(".");
    return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

export function kindFor(filename: string, contentType?: string): MediaKind | null {
    const fromExtension = KIND_BY_EXTENSION[extensionOf(filename)];
    if (fromExtension) return fromExtension;

    const prefix = (contentType ?? "").split("/")[0];
    if (prefix === "image" || prefix === "audio" || prefix === "video") return prefix;
    return null;
}

export function findAttachment(
    attachments: readonly MediaAttachment[],
    reference: string
): MediaAttachment | undefined {
    const wanted = basename(reference).toLowerCase();
    return attachments.find((file) => basename(file.filename).toLowerCase() === wanted);
}

export function mediaStorageConfigured(): boolean {
    return Boolean(env.s3.bucket && env.s3.accessKeyId && env.s3.secretAccessKey);
}

let client: S3Client | null = null;

function s3(): S3Client {
    if (!client) {
        client = new S3Client({
            region: env.s3.region ?? "auto",
            endpoint: env.s3.endpoint,
            forcePathStyle: Boolean(env.s3.endpoint),
            credentials: {
                accessKeyId: env.s3.accessKeyId ?? "",
                secretAccessKey: env.s3.secretAccessKey ?? ""
            }
        });
    }
    return client;
}

function safeName(filename: string): string {
    return (
        basename(filename)
            .replace(/[^\w.\-]+/g, "_")
            .slice(-100) || "file"
    );
}

function publicUrl(key: string): string {
    const base = (
        env.s3.endpoint ?? `https://s3.${env.s3.region ?? "us-east-1"}.amazonaws.com`
    ).replace(/\/+$/, "");
    return `${base}/${env.s3.bucket}/${key}`;
}

export async function storeMedia(file: MediaAttachment): Promise<StoredMedia> {
    const type = kindFor(file.filename, file.contentType);
    if (!type) {
        throw new Error(
            `"${file.filename}" names no media type — expected an image/audio/video extension or MIME type`
        );
    }

    const bucket = env.s3.bucket;
    const accessKeyId = env.s3.accessKeyId;
    const secretAccessKey = env.s3.secretAccessKey;
    if (!bucket || !accessKeyId || !secretAccessKey) {
        throw new Error(
            "media storage is not configured (S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY)"
        );
    }

    const key = `media/${randomUUID()}/${safeName(file.filename)}`;
    await s3().send(
        new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: file.content,
            ContentType: file.contentType
        })
    );

    return { url: publicUrl(key), type };
}
