import type { AppNotification } from "./types";
export interface NotificationChannel {
  dispose(): void;
  isActive(): boolean;
  guard<Args extends unknown[], Result>(callback: (...args: Args) => Result): (...args: Args) => Result | undefined;
  after(callback: () => void, delay: number): void;
}
export function createNotificationChannel(dependencies: {
  getToken(): string | null;
  getRevision(): number;
  isCurrent(revision: number): boolean;
  subscribe(listener: () => void): () => void;
  createSocket(token: string): WebSocket;
  host: Pick<Window, "setTimeout" | "clearTimeout" | "setInterval" | "clearInterval" | "addEventListener" | "removeEventListener">;
  document: Pick<Document, "visibilityState" | "addEventListener" | "removeEventListener">;
  resumeEvent: string;
  onNotification(notification: AppNotification): void;
  onResume?(): void;
  onDispose?(): void;
}): NotificationChannel;
