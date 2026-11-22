import { createSocketLease } from "../../../api/socket-lease.mjs";
const EMPTY = { active: false, startedBy: null, mode: null, participants: [], speaking: [], clips: [], online: null, cards: [] };
function toClip(c) {
  return { id: c.id, userId: c.userId, durationMs: c.durationMs, createdAt: Date.parse(c.createdAt), audioUrl: c.audioUrl, clientTempId: c.clientTempId };
}
function linksFrom(clips) {
  const map = new Map();
  for (let i = 1; i < clips.length; i++) {
    const a = clips[i], b = clips[i - 1];
    if (a.userId === b.userId || a.createdAt - b.createdAt > 20_000) continue;
    const key = `${a.userId}>${b.userId}`, l = map.get(key);
    map.set(key, l ? { ...l, weight: l.weight + 1, lastAt: a.createdAt } : { fromId: a.userId, toId: b.userId, weight: 1, lastAt: a.createdAt });
  }
  return [...map.values()];
}

/** Same production hook is exercised in Node with controlled platform dependencies. */
export function createRealLiveRoomHook({ react, session, api, cards, useSessionStore, resolveWsUrl, resumeEvent, getWindow, createSocket, randomUUID, showError }) {
  const { useState, useRef, useEffect, useMemo, useCallback } = react;
  const { applyCardEvent, dropOptimistic, restoreCard, upsertCard } = cards;
  return function useRealLiveRoom(spaceId, enabled, members) {
    const [state, setState] = useState(EMPTY);
    const [drafts, setDrafts] = useState([]);
    const [connection, setConnection] = useState(null);
    const [reconnect, setReconnect] = useState(0);
    const ownerRef = useRef(null);
    const inLiveRef = useRef(false);
    const accountId = useSessionStore(s => s.user?.id ?? null);
    const authed = useSessionStore(s => s.status === "authed");
    const installedToken = useSessionStore(s => s.token);
    useEffect(() => {
      const host = getWindow();
      if (!enabled || !authed || !accountId || !spaceId || !host) {
        inLiveRef.current = false; setState(EMPTY); setDrafts([]); setConnection(null); return;
      }
      const base = resolveWsUrl();
      if (!base) { setState(EMPTY); setDrafts([]); setConnection(null); return; }
      let socket = null, timer = null, attempt = 0, currentLease;
      const owned = {
        ownsView: () => ownerRef.current === owned,
        isActive: () => ownerRef.current === owned && !!currentLease?.isActive(),
        send: msg => {
          if (owned.isActive() && socket?.readyState === 1) socket.send(JSON.stringify(msg));
        },
      };
      const lease = createSocketLease({
        getRevision: session.getRevision, isCurrent: session.isCurrent, subscribe: session.subscribe,
        onDispose: () => {
          host.removeEventListener(resumeEvent, onResume);
          if (timer !== null) host.clearTimeout(timer);
          const previous = socket; socket = null;
          try {
            if (previous) {
              previous.onopen = null; previous.onmessage = null; previous.onclose = null; previous.onerror = null;
              if (previous.readyState === 0 || previous.readyState === 1) previous.close();
            }
          } finally {
            if (ownerRef.current === owned) {
              ownerRef.current = null; inLiveRef.current = false;
              setConnection(p => p === owned ? null : p); setState(EMPTY); setDrafts([]);
            }
          }
        },
      });
      currentLease = lease; ownerRef.current = owned; setConnection(owned);
      function connect() {
        if (!owned.isActive()) return;
        if (socket && (socket.readyState === 0 || socket.readyState === 1)) return;
        const token = session.getToken();
        if (!token || !owned.isActive()) return;
        let ws;
        try { ws = createSocket(`${base}/live/${encodeURIComponent(spaceId)}?token=${encodeURIComponent(token)}`); }
        catch { console.warn("[ws] эфир недоступен"); return; }
        socket = ws;
        ws.onopen = lease.guard(() => {
          if (socket !== ws) return;
          attempt = 0;
          if (inLiveRef.current) owned.send({ type: "join", spaceId });
        });
        ws.onmessage = lease.guard(e => {
          if (socket !== ws) return;
          let ev;
          try { ev = JSON.parse(String(e.data)); } catch { return; }
          if (!ev || typeof ev !== "object" || typeof ev.type !== "string") return;
          if (ev.type === "clip" && ev.clip && typeof ev.clip.id === "string") {
            setDrafts(d => owned.ownsView() ? d.filter(x => x.clientTempId !== ev.clip.clientTempId) : d);
          }
          setState(prev => {
            if (!owned.ownsView()) return prev;
            switch (ev.type) {
              case "snapshot": {
                const live = ev.live;
                if (!live || !Array.isArray(live.participants) || !Array.isArray(live.speaking)) return prev;
                return { ...live, mode: live.mode ?? null, clips: ev.clips ?? [], online: Number(ev.online), cards: ev.cards ?? [] };
              }
              case "presence": return { ...prev, online: Number(ev.online) };
              case "live_started": return { ...prev, active: true, startedBy: String(ev.startedBy), mode: typeof ev.mode === "string" ? ev.mode : null, clips: [], cards: [] };
              case "card_added": case "card_updated": case "card_removed": return { ...prev, cards: applyCardEvent(prev.cards, ev) };
              case "live_ended": return { ...EMPTY, online: prev.online };
              case "speaking": {
                const uid = String(ev.userId), rest = prev.speaking.filter(x => x !== uid);
                return { ...prev, speaking: ev.on ? [...rest, uid] : rest };
              }
              case "clip": {
                const clip = ev.clip;
                if (!clip || typeof clip.id !== "string" || prev.clips.some(c => c.id === clip.id)) return prev;
                return { ...prev, clips: [...prev.clips, clip].slice(-60) };
              }
              default: return prev;
            }
          });
        });
        ws.onerror = lease.guard(() => {});
        ws.onclose = lease.guard(e => {
          if (socket !== ws) return;
          socket = null;
          if (e.code === 4403 || e.code === 4401) return;
          if (timer !== null) host.clearTimeout(timer);
          timer = host.setTimeout(lease.guard(connect), Math.min(30_000, 1000 * 2 ** attempt++));
        });
      }
      function onResume() {
        if (!owned.isActive() || (socket && (socket.readyState === 0 || socket.readyState === 1))) return;
        if (timer !== null) host.clearTimeout(timer);
        attempt = 0; connect();
      }
      host.addEventListener(resumeEvent, onResume); connect();
      return lease.dispose;
    }, [spaceId, enabled, accountId, authed, reconnect]);
    useEffect(() => {
      // Re-open a replacement session only after its profile/store token is installed.
      // A regular refresh keeps the existing owner and never reaches this branch.
      if (ownerRef.current || !enabled || !authed || !accountId || !installedToken) return;
      if (session.getToken() !== installedToken) return;
      setReconnect(n => n + 1);
    }, [connection, installedToken, spaceId, enabled, authed, accountId]);

    const actions = useMemo(() => ({
      start: mode => { if (!connection?.isActive()) return; inLiveRef.current = true; connection.send({ type: "start_live", ...(mode ? { mode } : {}) }); },
      end: () => { if (!connection?.isActive()) return; inLiveRef.current = false; connection.send({ type: "end_live" }); },
      join: () => { if (!connection?.isActive()) return; inLiveRef.current = true; connection.send({ type: "join", spaceId }); },
      leave: () => { if (!connection?.isActive()) return; inLiveRef.current = false; connection.send({ type: "leave" }); },
      speaking: on => connection?.send({ type: "speaking", on }),
      addDraft: clip => { if (connection?.isActive()) setDrafts(d => connection.ownsView() ? [...d, { ...clip, draft: true }] : d); },
      dropDraft: id => { if (connection?.isActive()) setDrafts(d => connection.ownsView() ? d.filter(x => x.clientTempId !== id) : d); },
    }), [connection, spaceId]);
    const setCards = useCallback((owner, fn) => {
      if (owner?.isActive()) setState(p => owner.ownsView() ? { ...p, cards: fn(p.cards) } : p);
    }, []);
    const cardActions = useMemo(() => {
      const fail = (error, fallback) => {
        if (connection?.isActive()) showError(error instanceof Error ? error.message : fallback);
      };
      return {
        addCard: async input => {
          if (!connection?.isActive()) return false;
          const clientTempId = randomUUID();
          const optimistic = {
            id: `temp-${clientTempId}`, kind: input.kind, authorId: "me", text: input.text ?? "",
            ...(input.url ? { url: input.url } : {}), ...(input.previewUrl ? { mediaUrl: input.previewUrl, mediaMime: "image/jpeg" } : {}),
            status: "open", createdAt: new Date().toISOString(), clientTempId,
          };
          setCards(connection, c => [...c, optimistic]);
          try {
            const saved = input.kind === "photo" && input.file
              ? await api.addLivePhotoCard(spaceId, input.file, clientTempId)
              : await api.addLiveCard(spaceId, { kind: input.kind, clientTempId, ...(input.text ? { text: input.text } : {}), ...(input.url ? { url: input.url } : {}) });
            if (!connection.isActive()) return false;
            setCards(connection, c => upsertCard(c, saved)); return true;
          } catch (error) {
            setCards(connection, c => dropOptimistic(c, clientTempId)); fail(error, "Карточка не добавилась"); return false;
          }
        },
        resolveCard: (card, status) => {
          if (!connection?.isActive()) return;
          setCards(connection, c => upsertCard(c, { ...card, status }));
          api.updateLiveCard(spaceId, card.id, status)
            .then(saved => setCards(connection, c => upsertCard(c, saved)))
            .catch(error => { setCards(connection, c => restoreCard(c, card)); fail(error, "Не удалось изменить карточку"); });
        },
        removeCard: card => {
          if (!connection?.isActive()) return;
          setCards(connection, c => c.filter(x => x.id !== card.id));
          api.deleteLiveCard(spaceId, card.id)
            .catch(error => { setCards(connection, c => restoreCard(c, card)); fail(error, "Не удалось удалить карточку"); });
        },
      };
    }, [spaceId, connection, setCards]);
    return useMemo(() => {
      const byId = new Map(members.map(m => [m.id, m]));
      const clips = [...state.clips.map(toClip), ...drafts.filter(d => !state.clips.some(c => c.clientTempId === d.clientTempId))];
      const lastSpoke = new Map(); for (const c of clips) lastSpoke.set(c.userId, c.createdAt);
      const participants = [...new Set([...state.participants, ...state.speaking])].map(uid => ({
        userId: uid, name: byId.get(uid)?.name ?? "Участник", avatarUrl: byId.get(uid)?.avatarUrl ?? null,
        isSpeaking: state.speaking.includes(uid), lastSpokeAt: lastSpoke.get(uid) ?? null,
      }));
      return { active: state.active, participants, clips, links: linksFrom(clips), speakingCount: state.speaking.length,
        queue: 0, online: state.online, real: true, startedBy: state.startedBy, mode: state.mode, actions, cards: state.cards, cardActions };
    }, [state, drafts, members, actions, cardActions]);
  };
}
