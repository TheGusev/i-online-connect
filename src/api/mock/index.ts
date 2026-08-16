import type {
  Conversation,
  MatchCandidate,
  Message,
  Session,
  Space,
  TrustSummary,
  User,
} from "../types";
import {
  mockCandidates,
  mockConversations,
  mockCurrentUser,
  mockMessages,
  mockSpaces,
  mockTrust,
  mockUsers,
} from "./data";

/** Небольшая задержка, чтобы состояния загрузки были заметны в интерфейсе. */
const delay = (ms = 250) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export const mockApi = {
  async login(email: string): Promise<Session> {
    await delay();
    return { token: "mock-token", user: { ...mockCurrentUser, bio: `${email}` } };
  },
  async currentUser(): Promise<User> {
    await delay();
    return mockCurrentUser;
  },
  async userById(id: string): Promise<User> {
    await delay();
    const found = [mockCurrentUser, ...mockUsers].find((user) => user.id === id);
    if (!found) throw new Error("Профиль не найден");
    return found;
  },
  async candidates(): Promise<MatchCandidate[]> {
    await delay();
    return mockCandidates;
  },
  async conversations(): Promise<Conversation[]> {
    await delay();
    return mockConversations;
  },
  async messages(conversationId: string): Promise<Message[]> {
    await delay();
    return mockMessages.filter((message) => message.conversationId === conversationId);
  },
  async spaces(): Promise<Space[]> {
    await delay();
    return mockSpaces;
  },
  async trust(): Promise<TrustSummary> {
    await delay();
    return mockTrust;
  },
};
