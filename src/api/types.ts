export type TrustLevel = "new" | "verified" | "trusted" | "ambassador";

export interface User {
  id: string;
  name: string;
  age: number;
  city: string;
  bio: string;
  interests: string[];
  trustLevel: TrustLevel;
  trustScore: number;
  online: boolean;
}

export interface MatchCandidate extends User {
  compatibility: number;
  reasons: string[];
}

export interface Conversation {
  id: string;
  participant: Pick<User, "id" | "name" | "online">;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
}

export interface Message {
  id: string;
  conversationId: string;
  authorId: string;
  text: string;
  createdAt: string;
}

export interface Space {
  id: string;
  title: string;
  description: string;
  membersCount: number;
  topic: string;
}

export interface Session {
  token: string;
  user: User;
}

export interface TrustSummary {
  level: TrustLevel;
  score: number;
  checks: { id: string; label: string; done: boolean }[];
}

export type OnboardingIntent = "serious" | "friends" | "projects" | "unsure";

export interface OnboardingDraft {
  name: string;
  age: number | null;
  intent: OnboardingIntent | null;
  about: string;
  photoName: string | null;
  videoName: string | null;
  videoSkipped: boolean;
  interests: string[];
  values: { values: string; joy: string; dealbreakers: string };
  city: string;
  hideExactLocation: boolean;
}

/** Кандидат из дневной подборки: с медиа, цитатой и объяснением от AI. */
export interface DailyMatch extends MatchCandidate {
  quote: string;
  photoUrl: string;
  hasVideo: boolean;
  sharedInterests: string[];
  aiExplanation: string;
  firstMessageHint: string;
}

/** Ограниченная дневная подборка вместо бесконечной ленты. */
export interface DailyFeed {
  matches: DailyMatch[];
  dailyLimit: number;
  /** ISO-время следующего обновления подборки. */
  nextRefreshAt: string;
}
