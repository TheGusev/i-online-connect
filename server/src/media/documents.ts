import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { inflateRawSync } from "node:zlib";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { env } from "../env.ts";
import { badRequest } from "../http.ts";

export const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MIME: Record<string, string> = {
  pdf: "application/pdf", txt: "text/plain; charset=utf-8", csv: "text/csv; charset=utf-8",
  doc: "application/msword", xls: "application/vnd.ms-excel", ppt: "application/vnd.ms-powerpoint",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation", zip: "application/zip",
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif",
  bmp: "image/bmp", tif: "image/tiff", tiff: "image/tiff", ico: "image/x-icon", avif: "image/avif", heic: "image/heic", heif: "image/heif",
};
export function cleanFileName(name: string): string {
  const base = name.replace(/\\/g, "/").split("/").pop() ?? "file";
  const cleaned = base.replace(/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g, "").trim();
  const ext = path.extname(cleaned);
  return cleaned.length > 120 ? cleaned.slice(0, Math.max(1, 120 - ext.length)) + ext : cleaned || "file";
}

/** Validate ZIP directory offsets without extracting archives or trusting entry names. */
function zipEntries(b: Buffer): Map<string, Buffer> {
  let end = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) {
    if (b.readUInt32LE(i) === 0x06054b50 && i + 22 + b.readUInt16LE(i + 20) === b.length) { end = i; break; }
  }
  if (end < 0 || b.readUInt16LE(end + 4) || b.readUInt16LE(end + 6)) throw badRequest("Некорректный ZIP");
  const count = b.readUInt16LE(end + 10), size = b.readUInt32LE(end + 12), start = b.readUInt32LE(end + 16);
  if (count > 10000 || start + size !== end || b.readUInt16LE(end + 8) !== count) throw badRequest("Некорректный ZIP");
  let p = start; const entries = new Map<string, Buffer>();
  for (let i = 0; i < count; i++) {
    if (p + 46 > end || b.readUInt32LE(p) !== 0x02014b50) throw badRequest("Некорректный ZIP");
    const flags = b.readUInt16LE(p + 8), method = b.readUInt16LE(p + 10), packed = b.readUInt32LE(p + 20);
    const length = b.readUInt16LE(p + 28), extra = b.readUInt16LE(p + 30), comment = b.readUInt16LE(p + 32), offset = b.readUInt32LE(p + 42);
    if (p + 46 + length + extra + comment > end || offset + 30 > start || b.readUInt32LE(offset) !== 0x04034b50) throw badRequest("Некорректный ZIP");
    const name = b.subarray(p + 46, p + 46 + length).toString("utf8");
    const localLength = b.readUInt16LE(offset + 26), localExtra = b.readUInt16LE(offset + 28), data = offset + 30 + localLength + localExtra;
    if (data + packed > start || b.subarray(offset + 30, offset + 30 + localLength).toString("utf8") !== name) throw badRequest("Некорректный ZIP");
    if (name === "[Content_Types].xml" && !(flags & 1)) {
      try { entries.set(name, method === 0 ? b.subarray(data, data + packed) : method === 8 ? inflateRawSync(b.subarray(data, data + packed), { maxOutputLength: 256 * 1024 }) : Buffer.alloc(0)); }
      catch { throw badRequest("Некорректный документ Office"); }
    } else entries.set(name, Buffer.alloc(0));
    p += 46 + length + extra + comment;
  }
  if (p !== end) throw badRequest("Некорректный ZIP");
  return entries;
}

export function validateDocument(buffer: Buffer, name: string) {
  if (!buffer.length) throw badRequest("Файл пустой");
  if (buffer.length > MAX_FILE_BYTES) throw badRequest("Файл больше 25 МБ");
  const fileName = cleanFileName(name), ext = path.extname(fileName).slice(1).toLowerCase(), mime = MIME[ext];
  if (!mime) throw badRequest("Этот тип файла запрещён");
  const signature = (hex: string) => buffer.subarray(0, hex.length / 2).equals(Buffer.from(hex, "hex"));
  const ascii = (start: number, end: number) => buffer.subarray(start, end).toString("latin1");
  let valid = false;
  if (ext === "pdf") valid = ascii(0, 5) === "%PDF-" && buffer.subarray(-2048).includes(Buffer.from("%%EOF"));
  else if (ext === "txt" || ext === "csv") {
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
      valid = !/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text) && !/^\s*(?:#!|<\s*(?:!doctype|html|svg|script)|@echo\b|MZ|(?:import|export)\s|(?:const|let|var|function)\s+\w+\s*(?:=|\())/i.test(text);
    } catch { valid = false; }
  } else if (["zip", "docx", "xlsx", "pptx"].includes(ext)) {
    if (signature("504b0304") || signature("504b0506")) {
      const entries = zipEntries(buffer);
      if (ext === "zip") valid = true;
      else {
        const folder = ext === "docx" ? "word/document.xml" : ext === "xlsx" ? "xl/workbook.xml" : "ppt/presentation.xml";
        const content = entries.get("[Content_Types].xml")?.toString("utf8") ?? "";
        const expected = MIME[ext] + ".main+xml";
        // OOXML uses .document.main+xml / .sheet.main+xml / .presentation.main+xml.
        valid = entries.has(folder) && content.includes(expected) && !/macroEnabled|vbaProject/i.test(content) && ![...entries.keys()].some(n => /vbaProject\.bin$/i.test(n));
      }
    }
  } else if (["doc", "xls", "ppt"].includes(ext)) {
    const stream = ext === "doc" ? "WordDocument" : ext === "xls" ? "Workbook" : "PowerPoint Document";
    valid = signature("d0cf11e0a1b11e1") && buffer.includes(Buffer.from(stream, "utf16le"));
  } else if (ext === "jpg" || ext === "jpeg") valid = signature("ffd8ff");
  else if (ext === "png") valid = signature("89504e470d0a1a0a");
  else if (ext === "webp") valid = ascii(0,4) === "RIFF" && ascii(8,12) === "WEBP";
  else if (ext === "gif") valid = ["GIF87a","GIF89a"].includes(ascii(0,6));
  else if (ext === "bmp") valid = ascii(0,2) === "BM";
  else if (ext === "tif" || ext === "tiff") valid = signature("49492a00") || signature("4d4d002a");
  else if (ext === "ico") valid = signature("00000100");
  else if (["avif","heic","heif"].includes(ext)) valid = ascii(4,8) === "ftyp" && (ext === "avif" ? /avif|avis/ : /heic|heix|hevc|hevx|mif1|msf1/).test(ascii(8,32));
  if (!valid) throw badRequest("Содержимое файла не соответствует расширению");
  return { fileName, fileSize: buffer.length, mime, ext };
}

const directory = () => `${path.resolve(env.MEDIA_DIR)}-documents`;
export async function saveDocument(buffer: Buffer, ext: string) {
  const key = `${randomUUID()}.${ext}`;
  await mkdir(directory(), { recursive: true, mode: 0o700 });
  await writeFile(path.join(directory(), key), buffer, { mode: 0o600 });
  return key;
}
function documentPath(key: string) {
  if (!/^[0-9a-f-]{36}\.[a-z0-9]+$/.test(key)) throw badRequest("Некорректный файл");
  return path.join(directory(), key);
}
export const readDocument = (key: string) => readFile(documentPath(key));
export async function removeDocument(key: string) {
  try { await unlink(documentPath(key)); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
}
export function documentDisposition(name: string, mime: string, download: boolean) {
  const mode = !download && (mime === "application/pdf" || mime.startsWith("image/")) ? "inline" : "attachment";
  const clean = cleanFileName(name);
  return `${mode}; filename="${clean.replace(/[^a-zA-Z0-9._-]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(clean).replace(/['()*]/g, c => `%${c.charCodeAt(0).toString(16)}`)}`;
}
export async function parseDocumentUpload(request: FastifyRequest) {
  let buffer: Buffer | undefined, name = "", clientTempId = "", replyToId: string | undefined;
  for await (const part of request.parts({ limits: { fileSize: MAX_FILE_BYTES, files: 1, fields: 2 } })) {
    if (part.type === "file") { name = part.filename; buffer = await part.toBuffer(); if (part.file.truncated) throw badRequest("Файл больше 25 МБ"); }
    else if (part.fieldname === "clientTempId") clientTempId = z.string().uuid().parse(String(part.value));
    else if (part.fieldname === "replyToId") replyToId = z.string().uuid().parse(String(part.value));
  }
  if (!buffer || !clientTempId) throw badRequest("Укажите файл и clientTempId");
  return { buffer, clientTempId, replyToId, ...validateDocument(buffer, name) };
}