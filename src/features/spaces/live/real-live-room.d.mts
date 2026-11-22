import type { LiveRoom, LiveSeedMember } from "./useLiveRoom";
export function createRealLiveRoomHook(dependencies: {
  react: Pick<typeof import("react"), "useState" | "useRef" | "useEffect" | "useMemo" | "useCallback">;
  session: {
    getToken(): string | null;
    getRevision(): number;
    isCurrent(revision: number): boolean;
    subscribe(listener: () => void): () => void;
  };
  api: Pick<typeof import("@/api").spacesApi, "addLiveCard" | "addLivePhotoCard" | "updateLiveCard" | "deleteLiveCard">;
  cards: Pick<typeof import("./cards"), "applyCardEvent" | "dropOptimistic" | "restoreCard" | "upsertCard">;
  useSessionStore: typeof import("@/store/useSessionStore").useSessionStore;
  resolveWsUrl(): string;
  resumeEvent: string;
  getWindow(): Window | undefined;
  createSocket(url: string): WebSocket;
  randomUUID(): string;
  showError(message: string): void;
}): (spaceId: string, enabled: boolean, members: LiveSeedMember[]) => LiveRoom;
