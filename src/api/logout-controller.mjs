/** Logout invalidates local access immediately; network completion never writes a token. */
export function createLogoutController({ getToken, setToken, revoke, timeoutMs = 10_000 }) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new TypeError('Invalid logout timeout');
  let active = null;
  function logout() {
    const token = getToken();
    setToken(null);
    if (active) return active;
    const controller = new AbortController();
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        const error = new Error('Нет связи с сервером — выход выполнен только на этом устройстве');
        error.name = 'AbortError';
        error.code = 'LOGOUT_TIMEOUT';
        reject(error);
        controller.abort();
      }, timeoutMs);
    });
    const network = Promise.resolve().then(() => revoke(token, controller.signal));
    const task = Promise.race([network, timeout]).finally(() => {
      clearTimeout(timer);
      if (active === task) active = null;
    });
    active = task;
    return task;
  }
  async function waitForLogout() {
    while (active) {
      try { await active; } catch { /* A failed revoke must not permanently block the next login. */ }
    }
  }
  return { logout, waitForLogout };
}
