import "server-only";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { db } from "@/db";
import { files } from "@/db/schema";

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const MAX_FILES_PER_UPLOAD = 10;

const ALLOWED: Record<string, string[]> = {
  "image/png": ["png"], "image/jpeg": ["jpg", "jpeg"], "image/gif": ["gif"], "image/webp": ["webp"], "image/heic": ["heic"], "image/heif": ["heif"],
  "application/pdf": ["pdf"],
  "text/plain": ["txt"], "text/csv": ["csv"],
  "application/msword": ["doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["docx"],
  "application/vnd.ms-excel": ["xls"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ["xlsx"],
  "application/vnd.ms-powerpoint": ["ppt"],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": ["pptx"],
  "video/mp4": ["mp4"], "video/quicktime": ["mov"],
  "audio/mpeg": ["mp3"], "audio/mp4": ["m4a"],
};
const EXT_TO_MIME = Object.fromEntries(Object.entries(ALLOWED).flatMap(([m, exts]) => exts.map((e) => [e, m])));
export const ACCEPT_ATTR = Object.keys(EXT_TO_MIME).map((e) => "." + e).join(",");

export function sanitizeFilename(name: string) {
  const base = name.normalize("NFKC").replace(/[/\\?%*:|"<>\x00-\x1f]/g, "_").replace(/\s+/g, " ").trim();
  return (base || "file").slice(-120);
}

/** Checks a few magic bytes so a renamed executable can't pose as an image or PDF. */
function sniffOk(mime: string, buf: Buffer) {
  const head = buf.subarray(0, 12);
  const startsWith = (...b: number[]) => b.every((x, i) => head[i] === x);
  if (mime === "image/png") return startsWith(0x89, 0x50, 0x4e, 0x47);
  if (mime === "image/jpeg") return startsWith(0xff, 0xd8, 0xff);
  if (mime === "image/gif") return startsWith(0x47, 0x49, 0x46);
  if (mime === "application/pdf") return startsWith(0x25, 0x50, 0x44, 0x46);
  if (mime === "image/webp") return startsWith(0x52, 0x49, 0x46, 0x46);
  if (mime.includes("openxmlformats")) return startsWith(0x50, 0x4b);
  // Reject anything that looks like a Windows/ELF executable regardless of claimed type
  if (startsWith(0x4d, 0x5a) || startsWith(0x7f, 0x45, 0x4c, 0x46)) return false;
  return true;
}

export class UploadError extends Error {}

export function validateUpload(file: File) {
  if (file.size === 0) throw new UploadError(`"${file.name}" is empty.`);
  if (file.size > MAX_UPLOAD_BYTES) throw new UploadError(`"${file.name}" is larger than 25 MB.`);
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const mime = EXT_TO_MIME[ext];
  if (!mime) throw new UploadError(`"${file.name}" isn't a supported file type.`);
  return mime;
}

/* ── drivers ── */
interface Driver { put(key: string, body: Buffer, mime: string): Promise<void>; get(key: string): Promise<Buffer>; del(key: string): Promise<void>; }

function localDriver(): Driver {
  const root = path.resolve(process.env.STORAGE_DIR ?? "./.storage");
  const p = (key: string) => {
    const full = path.resolve(root, key);
    if (!full.startsWith(root + path.sep)) throw new Error("bad key");
    return full;
  };
  return {
    async put(key, body) { await mkdir(path.dirname(p(key)), { recursive: true }); await writeFile(p(key), body); },
    async get(key) { return readFile(p(key)); },
    async del(key) { await unlink(p(key)).catch(() => {}); },
  };
}

function s3Driver(): Driver {
  const client = new S3Client({
    region: process.env.S3_REGION ?? "auto",
    endpoint: process.env.S3_ENDPOINT,
    forcePathStyle: true,
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID!, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY! },
  });
  const Bucket = process.env.S3_BUCKET!;
  return {
    async put(key, body, mime) { await client.send(new PutObjectCommand({ Bucket, Key: key, Body: body, ContentType: mime })); },
    async get(key) {
      const out = await client.send(new GetObjectCommand({ Bucket, Key: key }));
      return Buffer.from(await out.Body!.transformToByteArray());
    },
    async del(key) { await client.send(new DeleteObjectCommand({ Bucket, Key: key })); },
  };
}

let _driver: Driver | null = null;
const driver = () => (_driver ??= process.env.STORAGE_DRIVER === "s3" ? s3Driver() : localDriver());

export type OwnerType = "task" | "submission" | "announcement" | "resource" | "avatar" | "project" | "branding";

export type PreparedUpload = { name: string; size: number; mime: string; buf: Buffer };

/** Validates files (type, size, contents) without storing anything. Throws UploadError. */
export async function prepareUploads(list: File[]): Promise<PreparedUpload[]> {
  const real = list.filter((f) => f && typeof f === "object" && f.size > 0);
  if (real.length > MAX_FILES_PER_UPLOAD) throw new UploadError(`Upload up to ${MAX_FILES_PER_UPLOAD} files at a time.`);
  const prepared: PreparedUpload[] = [];
  for (const f of real) {
    const mime = validateUpload(f);
    const buf = Buffer.from(await f.arrayBuffer());
    if (!sniffOk(mime, buf)) throw new UploadError(`"${f.name}" doesn't look like a valid ${mime.split("/")[1]} file.`);
    prepared.push({ name: f.name, size: f.size, mime, buf });
  }
  return prepared;
}

/** Stores already-validated uploads, returning the created file rows. */
export async function storePrepared(prepared: PreparedUpload[], owner: { type: OwnerType; id: string | null }, uploadedById: string) {
  const rows = [];
  for (const { name, size, mime, buf } of prepared) {
    const key = `${owner.type}/${new Date().toISOString().slice(0, 7)}/${randomUUID()}`;
    await driver().put(key, buf, mime);
    const [row] = await db.insert(files).values({
      storageKey: key, filename: sanitizeFilename(name), mimeType: mime, size, uploadedById, ownerType: owner.type, ownerId: owner.id,
    }).returning();
    rows.push(row);
  }
  return rows;
}

/** Validates and stores uploads, returning the created file rows. */
export async function saveUploads(list: File[], owner: { type: OwnerType; id: string | null }, uploadedById: string) {
  return storePrepared(await prepareUploads(list), owner, uploadedById);
}

export async function readStored(key: string) { return driver().get(key); }
export async function deleteStored(key: string) { return driver().del(key); }
