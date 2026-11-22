import { createSocketLease } from './socket-lease.mjs';

/** Read-only notification transport, owned by one session lifetime. */
export function createNotificationChannel({ getToken, getRevision, isCurrent, subscribe, createSocket, host, document, resumeEvent, onNotification, onResume = () => {}, onDispose = () => {} }) {
  let socket = null;
  let reconnectTimer = null;
  let heartbeat = null;
  let attempt = 0;
  const timers = new Set();
  const seen = new Set();
  const lease = createSocketLease({ getRevision, isCurrent, subscribe, onDispose: () => {
    host.removeEventListener('online', onVisible);
    host.removeEventListener(resumeEvent, onVisible);
    host.removeEventListener('pagehide', sendVisibility);
    document.removeEventListener('visibilitychange', onVisible);
    document.removeEventListener('visibilitychange', sendVisibility);
    if (heartbeat !== null) host.clearInterval(heartbeat);
    for (const timer of timers) host.clearTimeout(timer);
    timers.clear(); reconnectTimer = null;
    const previous = socket; socket = null;
    try {
      if (previous) {
        previous.onopen = null; previous.onmessage = null;
        previous.onclose = null; previous.onerror = null;
        if (previous.readyState === 0 || previous.readyState === 1) previous.close();
      }
    } finally { seen.clear(); onDispose(); }
  }});
  function cancel(timer) {
    if (timer === null) return;
    host.clearTimeout(timer); timers.delete(timer);
  }
  function schedule(callback, delay) {
    if (!lease.isActive()) return null;
    const timer = host.setTimeout(lease.guard(() => { timers.delete(timer); callback(); }), delay);
    timers.add(timer); return timer;
  }
  function sendVisibility() {
    if (!lease.isActive()) return;
    if (socket?.readyState === 1) socket.send(JSON.stringify({ type: 'visibility', visible: document.visibilityState === 'visible' }));
  }
  function connect() {
    if (!lease.isActive()) return;
    if (socket && (socket.readyState === 0 || socket.readyState === 1)) return;
    const token = getToken();
    if (!token || !lease.isActive()) return;
    let current;
    try { current = createSocket(token); }
    catch { console.warn('[ws] уведомления недоступны'); return; }
    socket = current;
    current.onopen = lease.guard(() => {
      if (socket !== current) return;
      attempt = 0; sendVisibility();
    });
    current.onmessage = lease.guard(event => {
      if (socket !== current) return;
      let frame;
      try { frame = JSON.parse(String(event.data)); } catch { return; }
      const incoming = frame?.notification;
      if (frame?.type !== 'notification' || !incoming || typeof incoming !== 'object' ||
        typeof incoming.id !== 'string' || typeof incoming.kind !== 'string' ||
        !incoming.payload || typeof incoming.payload !== 'object' || Array.isArray(incoming.payload)) return;
      if (seen.has(incoming.id)) return;
      seen.add(incoming.id);
      if (seen.size > 200) seen.delete(seen.values().next().value);
      onNotification(incoming);
    });
    current.onerror = lease.guard(() => {});
    current.onclose = lease.guard(event => {
      if (socket !== current) return;
      socket = null;
      if (event.code === 4403) return;
      cancel(reconnectTimer);
      const delay = Math.min(15_000, 1000 * 2 ** attempt++);
      reconnectTimer = schedule(connect, delay);
    });
  }
  function onVisible() {
    if (document.visibilityState !== 'visible' || !lease.isActive() || socket) return;
    cancel(reconnectTimer); reconnectTimer = null; attempt = 0;
    connect();
    if (lease.isActive()) onResume();
  }
  host.addEventListener('online', onVisible);
  host.addEventListener(resumeEvent, onVisible);
  host.addEventListener('pagehide', sendVisibility);
  document.addEventListener('visibilitychange', onVisible);
  document.addEventListener('visibilitychange', sendVisibility);
  heartbeat = host.setInterval(lease.guard(sendVisibility), 8000);
  connect();
  return {
    dispose: lease.dispose, isActive: lease.isActive, guard: lease.guard,
    after: (callback, delay) => { schedule(callback, delay); },
  };
}
