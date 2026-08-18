import type { FastifyInstance } from "fastify";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import fp from "fastify-plugin";
import { getEnv } from "../config/env.js";

declare module "fastify" {
  interface FastifyInstance {
    s3: S3Client | null;
    s3Upload: (
      key: string,
      body: Buffer,
      contentType?: string,
    ) => Promise<void>;
    s3PresignGet: (key: string) => Promise<string>;
    s3Exists: (key: string) => Promise<boolean>;
  }
}

async function s3Plugin(app: FastifyInstance) {
  const env = getEnv();

  if (!env.S3_BUCKET_NAME || !env.S3_ACCESS_KEY_ID) {
    app.log.warn("S3 not configured — media uploads will be disabled");
    app.decorate("s3", null);
    app.decorate("s3Upload", async () => {
      throw new Error("S3 not configured");
    });
    app.decorate("s3PresignGet", async () => {
      throw new Error("S3 not configured");
    });
    app.decorate("s3Exists", async () => false);
    return;
  }

  const s3 = new S3Client({
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT_URL,
    forcePathStyle: true,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
    },
  });

  const bucket = env.S3_BUCKET_NAME;

  app.decorate("s3", s3);

  app.decorate(
    "s3Upload",
    async (key: string, body: Buffer, contentType?: string) => {
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
        }),
      );
    },
  );

  app.decorate("s3PresignGet", async (key: string) => {
    const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
    return getSignedUrl(s3, cmd, { expiresIn: env.S3_PRESIGNED_URL_EXPIRY });
  });

  app.decorate("s3Exists", async (key: string) => {
    try {
      await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  });
}

export default fp(s3Plugin, { name: "s3" });
