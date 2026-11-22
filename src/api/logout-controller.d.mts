export function createLogoutController(dependencies: {
  getToken(): string | null;
  setToken(token: string | null): void;
  revoke(token: string | null, signal: AbortSignal): Promise<void>;
  timeoutMs?: number;
}): {
  logout(): Promise<void>;
  waitForLogout(): Promise<void>;
};
