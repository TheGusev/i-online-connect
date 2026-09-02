/**
 * DTO, которые API отдаёт наружу. Повторяют src/api/types.ts фронтенда
 * один-в-один — при изменении правьте оба файла синхронно.
 */

export type TrustLevel = "new" | "verified" | "trusted" | "ambassador";

export interface UserDto {
  id: string;
  name: string;
  age: number;
  city: string;
  bio: string;
  interests: string[];
  trustLevel: TrustLevel;
  trustScore: number;
  online: boolean;
  /** Главное фото профиля: подставляется в аватары интерфейса. */
  avatarUrl?: string;
}


export interface ProfileMediaDto {
  id: string;
  kind: "photo" | "video";
  url: string;
}

export interface ProfileDetailDto extends UserDto {
  media: ProfileMediaDto[];
  intent: "serious" | "friends" | "projects";
  intentNote: string;
  values: string[];
  trust: { videoVerified: boolean; monthsOnPlatform: number; safeMeetings: number };
}

export interface MyProfileDto extends ProfileDetailDto {
  privacy: {
    exactLocation: "nobody" | "matches" | "everyone";
    visibleInFeed: boolean;
    whoCanMessage: "everyone" | "verified" | "matches";
  };
  verification: "none" | "pending" | "verified";
  stats: { cleanConversations: number; safeMeetings: number; joinedAt: string };
}

export interface DailyMatchDto extends UserDto {
  compatibility: number;
  reasons: string[];
  quote: string;
  photoUrl: string;
  hasVideo: boolean;
  sharedInterests: string[];
  aiExplanation: string;
  firstMessageHint: string;
}

export interface MessageDto {
  id: string;
  conversationId: string;
  authorId: string;
  text: string;
  createdAt: string;
  kind?: "text" | "meeting";
}

/** Строка профиля из SQL -> UserDto. Единая точка сборки, чтобы наружу
 *  не утекли служебные поля (координаты, e-mail, внутренние счётчики). */
export interface ProfileRow {
  id: string;
  name: string;
  age: number | null;
  city: string;
  bio: string;
  trust_level: TrustLevel;
  trust_score: number;
  last_seen_at: Date | null;
  interests: string[] | null;
  /** Главное фото профиля, если оно уже загружено. */
  avatar_url?: string | null;
}

const ONLINE_WINDOW_MS = 5 * 60 * 1000;

export function toUserDto(row: ProfileRow): UserDto {
  return {
    id: row.id,
    name: row.name,
    age: row.age ?? 0,
    city: row.city,
    bio: row.bio,
    interests: row.interests ?? [],
    trustLevel: row.trust_level,
    trustScore: row.trust_score,
    online: row.last_seen_at ? Date.now() - row.last_seen_at.getTime() < ONLINE_WINDOW_MS : false,
    ...(row.avatar_url ? { avatarUrl: row.avatar_url } : {}),
  };
}

