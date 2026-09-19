/**
 * Расшифровка голосовых сообщений в текст.
 *
 * Звук уходит в AI Gateway (OpenAI-совместимый /audio/transcriptions) как
 * multipart-загрузка. Правила:
 *  - ключ только из окружения, запрос уходит с сервера (в браузер не попадает);
 *  - ответ модели считаем данными, а не инструкцией: берём только строку текста;
 *  - ошибки провайдера не превращаем в пустой успех — вызывающий покажет их.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

import { env } from "../env.ts";

export class TranscribeError extends Error {
  readonly retryable: boolean;
  constructor(message: string, retryable = false) {
    super(message);
    this.retryable = retryable;
  }
}

const MIME_BY_EXT: Record<string, string> = {
  ".m4a": "audio/mp4",
  ".mp4": "audio/mp4",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".webm": "audio/webm",
};

/** Расшифровывает файл голосового сообщения. Возвращает распознанный текст. */
export async function transcribeVoiceFile(filePath: string): Promise<string> {
  if (!env.AI_API_KEY) {
    throw new TranscribeError("Расшифровка голосовых не настроена на сервере");
  }

  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME_BY_EXT[ext] ?? "audio/mp4";
  const buffer = await readFile(filePath);

  const form = new FormData();
  form.append("model", env.AI_TRANSCRIBE_MODEL);
  form.append(
    "file",
    new Blob([new Uint8Array(buffer)], { type: mime }),
    `voice${ext || ".m4a"}`,
  );

  const response = await fetch(`${env.AI_API_URL.replace(/\/$/, "")}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.AI_API_KEY}` },
    body: form,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    // Повторять имеет смысл только при ограничении частоты и сбоях провайдера.
    const retryable = response.status === 429 || response.status >= 500;
    if (response.status === 402) {
      throw new TranscribeError("Закончились кредиты на распознавание речи", false);
    }
    if (response.status === 404) {
      throw new TranscribeError("Распознавание речи недоступно для этого сервера", false);
    }
    throw new TranscribeError(
      retryable
        ? "Сервис распознавания сейчас занят — попробуйте ещё раз через минуту"
        : `Не удалось расшифровать запись (${response.status}) ${detail.slice(0, 200)}`.trim(),
      retryable,
    );
  }

  const data = (await response.json().catch(() => null)) as { text?: unknown } | null;
  const text = typeof data?.text === "string" ? data.text.trim() : "";
  return text.slice(0, 4000);
}
