export async function cleanupLogoutState({ clearSession, cancelQueries, clearCache, isCurrent = () => true }) {
  if (!isCurrent()) return;
  clearSession();
  let cancellation;
  try { cancellation = cancelQueries(); }
  catch (cause) {
    if (isCurrent()) clearCache();
    throw cause;
  }
  try {
    if (isCurrent()) clearCache();
  } finally {
    await cancellation;
  }
}
