export type ScopedRefreshResult =
  | { kind: "ok"; token: string }
  | { kind: "invalid" }
  | { kind: "temporary" }
  | { kind: "stale" };
export interface SessionScope {
  getToken(): string | null;
  setToken(token: string | null): void;
  capture(): { revision: number; token: string | null };
  isCurrent(revision: number): boolean;
  assertCurrent(revision: number): void;
  refreshAccessToken(): Promise<ScopedRefreshResult>;
}
export function createSessionScope(dependencies: {
  readToken(): string | null;
  writeToken(token: string | null): void;
  refresh(): Promise<ScopedRefreshResult>;
  onInvalid(): void;
}): SessionScope;
export function subscribeSessionChanges(
  getToken: () => string | null,
  listener: () => void,
): () => void;
