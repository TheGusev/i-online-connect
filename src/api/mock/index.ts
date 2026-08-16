import type {
  Conversation,
  DailyFeed,
  MatchCandidate,
  Message,
  MyProfile,
  OnboardingDraft,
  ProfileDetail,
  Session,
  Space,
  TrustSummary,
  User,
} from "../types";
import {
  mockCandidates,
  mockConversations,
  mockDailyFeed,
  mockCurrentUser,
  mockMessages,
  mockSpaces,
  mockTrust,
  mockUsers,
} from "./data";
import { mockMyProfile, mockProfileDetails } from "./profiles";

/** Локальная копия своего профиля: правки сохраняются в рамках сессии. */
let myProfile: MyProfile = { ...mockMyProfile };

/** Небольшая задержка, чтобы состояния загрузки были заметны в интерфейсе. */
const delay = (ms = 250) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export const mockApi = {
  async submitOnboarding(draft: OnboardingDraft): Promise<User> {
    await delay(1600);
    return {
      ...mockCurrentUser,
      name: draft.name || mockCurrentUser.name,
      age: draft.age ?? mockCurrentUser.age,
      city: draft.city || mockCurrentUser.city,
      bio: draft.about || mockCurrentUser.bio,
      interests: draft.interests.length ? draft.interests : mockCurrentUser.interests,
      trustLevel: draft.videoSkipped ? "new" : "verified",
    };
  },
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
  async profileDetail(id: string): Promise<ProfileDetail> {
    await delay(300);
    if (id === "me") return myProfile;
    const found = mockProfileDetails.find((profile) => profile.id === id);
    if (!found) throw new Error("Профиль не найден");
    return found;
  },
  async myProfile(): Promise<MyProfile> {
    await delay(300);
    return myProfile;
  },
  async updateMyProfile(patch: Partial<MyProfile>): Promise<MyProfile> {
    await delay(200);
    myProfile = { ...myProfile, ...patch };
    return myProfile;
  },
  async candidates(): Promise<MatchCandidate[]> {
    await delay();
    return mockCandidates;
  },
  async dailyFeed(): Promise<DailyFeed> {
    await delay(400);
    const next = new Date();
    next.setUTCHours(next.getUTCHours() + 14, 0, 0, 0);
    return { ...mockDailyFeed, nextRefreshAt: next.toISOString() };
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
