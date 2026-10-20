/** Чистые правила клипов эфира (без базы и файловой системы). */

/** Файлы клипов к удалению: без пустых, чужих путей (resolve → null) и дублей. */
export function clipFilesToDelete(
  urls: Array<string | null | undefined>,
  resolve: (url: string) => string | null,
): string[] {
  const out = new Set<string>();
  for (const url of urls) {
    if (!url) continue;
    const p = resolve(url);
    if (p) out.add(p);
  }
  return [...out];
}

/** Открытые в базе сессии, которых нет среди активных в памяти, — зависшие. */
export function staleSessionIds(openInDb: string[], activeInMemory: Iterable<string>): string[] {
  const active = new Set(activeInMemory);
  return openInDb.filter((id) => !active.has(id));
}

export interface LiveClipRow {
  id: string;
  client_temp_id: string;
  media_url: string;
  media_mime: string;
  duration_ms: number;
  created_at: Date | string;
}

/** Повторная отправка: если клип с тем же ключом уже есть — вернуть его, новый не создавать. */
export function resolveLiveClipRetry<T>(existing: T | null | undefined): { reuse: true; clip: T } | { reuse: false } {
  return existing ? { reuse: true, clip: existing } : { reuse: false };
}

export function toLiveClipDto(row: LiveClipRow) {
  return {
    id: row.id,
    clientTempId: row.client_temp_id,
    audioUrl: row.media_url,
    mime: row.media_mime,
    durationMs: row.duration_ms,
    createdAt: new Date(row.created_at).toISOString(),
    live: true as const,
  };
}
