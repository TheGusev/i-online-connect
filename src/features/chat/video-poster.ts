/** Derive a protected API poster URL, never an external image URL. */
export function videoPosterUrl(source: string, apiBase: string): string | undefined {
  if (/^(blob:|data:)/i.test(source)) return undefined;
  let pathname: string;
  try { pathname = new URL(source, "https://local.invalid").pathname; }
  catch { return undefined; }
  const match = /^\/(?:media|uploads|api\/media-file)\/chat\/([0-9a-f-]{36})\/([0-9a-f-]{36})\.mp4$/i.exec(pathname);
  if (!match) return undefined;
  return `${apiBase.replace(/\/$/, "")}/chat-video-poster/${match[1]}/${match[2]}.jpg`;
}
