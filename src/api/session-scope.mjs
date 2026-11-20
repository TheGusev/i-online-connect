export function createSessionScope({ readToken, writeToken, refresh, onInvalid }) {
  let revision = 0;
  let observed;
  let inFlight = null;
  function getToken() {
    const token = readToken();
    if (observed !== undefined && token !== observed) revision += 1;
    observed = token;
    return token;
  }
  function capture() {
    const token = getToken();
    return { revision, token };
  }
  function isCurrent(expected) {
    getToken();
    return revision === expected;
  }
  function assertCurrent(expected) {
    if (!isCurrent(expected)) {
      const error = new Error('Session changed');
      error.name = 'AbortError';
      error.code = 'SESSION_CHANGED';
      throw error;
    }
  }
  function write(token) {
    writeToken(token);
    observed = token;
  }
  function setToken(token) {
    getToken();
    revision += 1;
    write(token);
  }
  function refreshAccessToken() {
    const start = capture();
    if (!start.token) return Promise.resolve({ kind: 'stale' });
    if (inFlight?.revision === start.revision) return inFlight.promise;
    const flight = { revision: start.revision, promise: null };
    flight.promise = Promise.resolve().then(() => {
      if (!isCurrent(start.revision)) return { kind: 'stale' };
      return refresh();
    }).then(result => {
      if (!isCurrent(start.revision)) return { kind: 'stale' };
      if (result.kind === 'ok') write(result.token);
      else if (result.kind === 'invalid') {
        setToken(null);
        onInvalid();
      }
      return result;
    }).finally(() => {
      if (inFlight === flight) inFlight = null;
    });
    inFlight = flight;
    return flight.promise;
  }
  return { getToken, setToken, capture, isCurrent, assertCurrent, refreshAccessToken };
}
