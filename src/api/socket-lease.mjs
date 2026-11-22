/** A disposable transport lifetime bound to one session revision. */
export function createSocketLease({ getRevision, isCurrent, subscribe, onDispose }) {
  const revision = getRevision();
  let active = true;
  let unsubscribe = () => {};
  function dispose() {
    if (!active) return;
    active = false;
    unsubscribe();
    onDispose();
  }
  function isActive() {
    if (active && !isCurrent(revision)) dispose();
    return active;
  }
  unsubscribe = subscribe(() => {
    if (!isCurrent(revision)) dispose();
  });
  function guard(callback) {
    return (...args) => {
      if (isActive()) return callback(...args);
    };
  }
  return { isActive, dispose, guard };
}
