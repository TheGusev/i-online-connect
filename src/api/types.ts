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
