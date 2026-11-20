export interface LogoutCleanupDependencies {
  clearSession: () => void;
  cancelQueries: () => Promise<unknown>;
  clearCache: () => void;
}

export function cleanupLogoutState(dependencies: LogoutCleanupDependencies): Promise<void>;
