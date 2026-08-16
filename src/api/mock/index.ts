import type {
  Conversation,
  ConversationParticipant,
  DailyFeed,
  MatchCandidate,
  MeetingKind,
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

/** Диалоги и сообщения живут в памяти, чтобы отправка выглядела правдоподобно. */
let conversations: Conversation[] = mockConversations.map((item) => ({ ...item }));
let messages: Message[] = mockMessages.map((item) => ({ ...item }));

function starterTemplates(participant: ConversationParticipant, shared: string[]): string[] {
  const [first, second] = shared;
  const options: string[] = [];
  if (first) {
    options.push(
      `Привет, ${participant.name}! Увидел, что у нас общее — ${first}. Как ты к этому пришла?`,
    );
  }
  if (second) {
    options.push(
      `Привет! Заметил, что мы оба любим ${second}. Расскажи, что тебя в этом держит?`,
    );
  }
  options.push(
    `Привет, ${participant.name}! Не хочу писать шаблонно: что за последнее время тебя по-настоящему обрадовало?`,
  );
  return options.slice(0, 3);
}

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
    return [...conversations].sort(
      (a, b) => Date.parse(b.lastMessageAt) - Date.parse(a.lastMessageAt),
    );
  },
  async conversation(id: string): Promise<Conversation> {
    await delay(200);
    const found = conversations.find((item) => item.id === id);
    if (!found) throw new Error("Диалог не найден");
    return found;
  },
  async messages(conversationId: string): Promise<Message[]> {
    await delay();
    return messages.filter((message) => message.conversationId === conversationId);
  },
  async messageStarters(conversationId: string): Promise<string[]> {
    await delay(350);
    const conversation = conversations.find((item) => item.id === conversationId);
    if (!conversation) return [];
    return starterTemplates(conversation.participant, conversation.sharedInterests);
  },
  async sendMessage(
    conversationId: string,
    text: string,
    kind: "text" | "meeting" = "text",
  ): Promise<Message> {
    await delay(200);
    const message: Message = {
      id: `m-${Date.now()}`,
      conversationId,
      authorId: "me",
      text,
      createdAt: new Date().toISOString(),
      status: "sent",
      kind,
    };
    messages = [...messages, message];
    conversations = conversations.map((item) =>
      item.id === conversationId
        ? {
            ...item,
            lastMessage: text,
            lastMessageAt: message.createdAt,
            unreadCount: 0,
            awaitingReply: false,
            lastMessageFromMe: true,
          }
        : item,
    );
    return message;
  },
  async markConversationRead(conversationId: string): Promise<void> {
    await delay(120);
    conversations = conversations.map((item) =>
      item.id === conversationId ? { ...item, unreadCount: 0 } : item,
    );
  },
  async suggestMeeting(
    conversationId: string,
    kind: MeetingKind,
    text: string,
  ): Promise<Message> {
    return mockApi.sendMessage(conversationId, text, "meeting");
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
