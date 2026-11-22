export interface StoryItem {
  id: string;
  author: { id: string; name: string; avatarUrl: string | null };
  kind: "image" | "video";
  caption: string;
  durationMs: number | null;
  createdAt: string;
  expiresAt: string;
  seen: boolean;
  mine: boolean;
  viewCount?: number;
  mediaPath: string;
}
export interface StoryCursor { at: string; id: string }
export interface StoryPage {
  items: StoryItem[];
  nextCursor: StoryCursor | null;
  unseenCount: number;
}
export interface StoryGroup {
  id: string;
  name: string;
  avatarUrl: string | null;
  items: StoryItem[];
  unseen: boolean;
  latest: number;
}
export function groupStories(items: StoryItem[], ownerId: string, now: number): StoryGroup[] {
  const groups = new Map<string, StoryGroup>();
  const unique = new Map(items.map(item => [item.id, item]));
  for (const item of unique.values()) {
    if (!(Date.parse(item.expiresAt) > now)) continue;
    let group = groups.get(item.author.id);
    if (!group) {
      group = {
        id: item.author.id, name: item.author.name,
        avatarUrl: item.author.avatarUrl, items: [], unseen: false, latest: 0,
      };
      groups.set(group.id, group);
    }
    group.items.push(item);
    group.unseen ||= !item.seen;
    group.latest = Math.max(group.latest, Date.parse(item.createdAt));
  }
  for (const group of groups.values()) {
    group.items.sort((a, b) =>
      Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id));
  }
  return [...groups.values()].sort((a, b) => {
    if (a.id === ownerId) return -1;
    if (b.id === ownerId) return 1;
    return Number(b.unseen) - Number(a.unseen) ||
      b.latest - a.latest || a.id.localeCompare(b.id);
  });
}
