export interface LogoutCleanupDependencies {
  clearSession: () => void;
  cancelQueries: () => Promise<unknown>;
  clearCache: () => void;
  isCurrent?: () => boolean;
}

export function cleanupLogoutState(dependencies: LogoutCleanupDependencies): Promise<void>;
