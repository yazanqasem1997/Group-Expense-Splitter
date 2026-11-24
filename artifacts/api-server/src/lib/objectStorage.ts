import { PassThrough, Readable } from "node:stream";
import { randomUUID } from "node:crypto";
import {
  S3Client,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * File storage on any S3-compatible bucket (Supabase Storage, Cloudflare R2, AWS S3).
 * Settings: S3_ENDPOINT, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET.
 * Object paths keep the same shape the app already uses: /objects/<key>.
 */
let client: S3Client | null = null;
function s3(): S3Client {
  if (!client) {
    client = new S3Client({
      region: process.env.S3_REGION || "us-east-1",
      endpoint: process.env.S3_ENDPOINT,
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
      },
      // Signed upload links must not demand extra checksum headers from the phone.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
  }
  return client;
}

function bucket(): string {
  const name = process.env.S3_BUCKET;
  if (!name) throw new Error("S3_BUCKET is not set");
  return name;
}

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

function isMissing(err: unknown): boolean {
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e?.name === "NotFound" || e?.name === "NoSuchKey" || e?.$metadata?.httpStatusCode === 404;
}

/** The small set of file operations the routes use. */
export class StoredFile {
  constructor(readonly key: string) {}

  async exists(): Promise<[boolean]> {
    try {
      await s3().send(new HeadObjectCommand({ Bucket: bucket(), Key: this.key }));
      return [true];
    } catch (err) {
      if (isMissing(err)) return [false];
      throw err;
    }
  }

  async getMetadata(): Promise<[{ contentType?: string; size?: number }]> {
    const head = await s3().send(new HeadObjectCommand({ Bucket: bucket(), Key: this.key }));
    return [{ contentType: head.ContentType, size: head.ContentLength }];
  }

  createReadStream(): Readable {
    const out = new PassThrough();
    s3()
      .send(new GetObjectCommand({ Bucket: bucket(), Key: this.key }))
      .then((res) => {
        const body = res.Body as Readable;
        body.on("error", (e) => out.destroy(e));
        body.pipe(out);
      })
      .catch((e) => out.destroy(e));
    return out;
  }

  async download(): Promise<[Buffer]> {
    const res = await s3().send(new GetObjectCommand({ Bucket: bucket(), Key: this.key }));
    const bytes = await res.Body!.transformToByteArray();
    return [Buffer.from(bytes)];
  }
}

const UPLOAD_LINK_TTL_SEC = 900;

export class ObjectStorageService {
  async searchPublicObject(_filePath: string): Promise<StoredFile | null> {
    return null;
  }

  async downloadObject(file: StoredFile, cacheTtlSec = 3600): Promise<Response> {
    const [metadata] = await file.getMetadata();
    const webStream = Readable.toWeb(file.createReadStream()) as ReadableStream;
    const headers: Record<string, string> = {
      "Content-Type": metadata.contentType || "application/octet-stream",
      "Cache-Control": `private, max-age=${cacheTtlSec}`,
    };
    if (metadata.size) headers["Content-Length"] = String(metadata.size);
    return new Response(webStream, { headers });
  }

  async getObjectEntityUploadURL(): Promise<string> {
    return (await this.getObjectEntityUploadTarget()).uploadURL;
  }

  async getObjectEntityUploadTarget(): Promise<{ uploadURL: string; objectPath: string }> {
    const key = `uploads/${randomUUID()}`;
    return { uploadURL: await this.signedPut(key), objectPath: `/objects/${key}` };
  }

  async getProfilePhotoUploadTarget(userId: string): Promise<{ uploadURL: string }> {
    return { uploadURL: await this.signedPut(`profile-photos/${userId}/avatar`) };
  }

  async getObjectEntityDownloadURL(objectPath: string, ttlSec = 3600): Promise<string> {
    const key = this.keyFor(objectPath);
    return getSignedUrl(s3(), new GetObjectCommand({ Bucket: bucket(), Key: key }), { expiresIn: ttlSec });
  }

  async getObjectEntityFile(objectPath: string): Promise<StoredFile> {
    const file = new StoredFile(this.keyFor(objectPath));
    const [exists] = await file.exists();
    if (!exists) throw new ObjectNotFoundError();
    return file;
  }

  private keyFor(objectPath: string): string {
    if (!objectPath.startsWith("/objects/")) throw new ObjectNotFoundError();
    const key = objectPath.slice("/objects/".length);
    if (!key || key.includes("..")) throw new ObjectNotFoundError();
    return key;
  }

  private signedPut(key: string): Promise<string> {
    return getSignedUrl(s3(), new PutObjectCommand({ Bucket: bucket(), Key: key }), {
      expiresIn: UPLOAD_LINK_TTL_SEC,
    });
  }
}
