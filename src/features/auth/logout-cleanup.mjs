export async function cleanupLogoutState({ clearSession, cancelQueries, clearCache }) {
  clearSession();
  try {
    await cancelQueries();
  } finally {
    clearCache();
  }
}
