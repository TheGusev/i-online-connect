export interface HistoryCursor {
  at: string | null;
  id: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const PRECISE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;

function validTimestamp(value: string): boolean {
  if (!ISO.test(value) || !Number.isFinite(Date.parse(value))) return false;
  const wall = new Date(value.slice(0, 19) + "Z");
  return Number.isFinite(wall.getTime()) && wall.toISOString().slice(0, 19) === value.slice(0, 19);
}

export function encodeHistoryCursor(at: string, id: string): string {
  if (!PRECISE.test(at) || !validTimestamp(at) || !UUID.test(id)) {
    throw new Error("Invalid history cursor");
  }
  return "h1." + Buffer.from(JSON.stringify([at, id.toLowerCase()]), "utf8").toString("base64url");
}

export function decodeHistoryCursor(value: string | undefined): HistoryCursor {
  if (value === undefined) return { at: null, id: null };
  if (typeof value !== "string" || value.length === 0 || value.length > 512) {
    throw new Error("Invalid history cursor");
  }
  if (!value.startsWith("h1.")) {
    if (!validTimestamp(value)) throw new Error("Invalid history cursor");
    return { at: value, id: null };
  }
  const encoded = value.slice(3);
  if (!/^[A-Za-z0-9_-]+$/.test(encoded)) throw new Error("Invalid history cursor");
  const bytes = Buffer.from(encoded, "base64url");
  if (bytes.toString("base64url") !== encoded) throw new Error("Invalid history cursor");
  let parsed: unknown;
  try { parsed = JSON.parse(bytes.toString("utf8")); }
  catch { throw new Error("Invalid history cursor"); }
  if (!Array.isArray(parsed) || parsed.length !== 2) throw new Error("Invalid history cursor");
  const [at, id] = parsed;
  if (typeof at !== "string" || typeof id !== "string" ||
      !PRECISE.test(at) || !validTimestamp(at) || !UUID.test(id)) {
    throw new Error("Invalid history cursor");
  }
  return { at, id: id.toLowerCase() };
}
