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
  SpaceDetail,
  SpaceDraft,
  SpaceMessage,
  TrustSummary,
  User,
} from "../types";
import {
  mockCandidates,
  mockConversations,
  mockDailyFeed,
  mockCurrentUser,
  mockMessages,
  mockTrust,
  mockUsers,
} from "./data";
import { mockMyProfile, mockProfileDetails } from "./profiles";
import { mockSpaceDetails, mockSpaceMessages } from "./spaces";

/** Локальная копия своего профиля: правки сохраняются в рамках сессии. */
let myProfile: MyProfile = { ...mockMyProfile };

/** Сообщества и групповые чаты живут в памяти: вступление и «Пойду» сохраняются. */
let spaces: SpaceDetail[] = mockSpaceDetails.map((space) => ({ ...space }));
let spaceMessages: SpaceMessage[] = mockSpaceMessages.map((item) => ({ ...item }));

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
    return spaces.map(({ members: _members, events, hostName: _hostName, ...space }) => ({
      ...space,
      nextEvent: [...events].sort(
        (a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt),
      )[0],
    }));
  },
  async space(id: string): Promise<SpaceDetail> {
    await delay(250);
    const found = spaces.find((space) => space.id === id);
    if (!found) throw new Error("Пространство не найдено");
    return {
      ...found,
      nextEvent: [...found.events].sort(
        (a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt),
      )[0],
    };
  },
  /** Открытые сообщества пускают сразу, приватные — после вопроса организатору. */
  async joinSpace(id: string, answer?: string): Promise<SpaceDetail> {
    await delay(400);
    spaces = spaces.map((space) => {
      if (space.id !== id) return space;
      if (space.joinPolicy === "question" && !space.isMember) {
        return { ...space, pendingRequest: Boolean(answer) };
      }
      return { ...space, isMember: true, membersCount: space.membersCount + 1 };
    });
    return mockApi.space(id);
  },
  async leaveSpace(id: string): Promise<SpaceDetail> {
    await delay(250);
    spaces = spaces.map((space) =>
      space.id === id
        ? {
            ...space,
            isMember: false,
            pendingRequest: false,
            membersCount: Math.max(0, space.membersCount - 1),
          }
        : space,
    );
    return mockApi.space(id);
  },
  async rsvpEvent(spaceId: string, eventId: string, going: boolean): Promise<SpaceDetail> {
    await delay(200);
    spaces = spaces.map((space) =>
      space.id === spaceId
        ? {
            ...space,
            events: space.events.map((item) =>
              item.id === eventId
                ? {
                    ...item,
                    going,
                    goingCount: Math.max(0, item.goingCount + (going ? 1 : -1)),
                  }
                : item,
            ),
          }
        : space,
    );
    return mockApi.space(spaceId);
  },
  async createSpace(draft: SpaceDraft): Promise<SpaceDetail> {
    await delay(700);
    const created: SpaceDetail = {
      id: `s-${Date.now()}`,
      title: draft.title,
      description: draft.description,
      membersCount: 1,
      topic: draft.category,
      coverUrl: draft.coverUrl || mockSpaceDetails[0]!.coverUrl,
      category: draft.category,
      format: draft.format,
      cadence: draft.cadence,
      city: draft.city || mockCurrentUser.city,
      distanceKm: 0,
      verifiedCommunity: false,
      joinPolicy: "open",
      interests: [],
      isMember: true,
      hostName: mockCurrentUser.name,
      members: [{ id: mockCurrentUser.id, name: mockCurrentUser.name, host: true }],
      events: [],
    };
    spaces = [created, ...spaces];
    return created;
  },
  async spaceMessages(spaceId: string): Promise<SpaceMessage[]> {
    await delay();
    return spaceMessages
      .filter((message) => message.spaceId === spaceId)
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  },
  async sendSpaceMessage(spaceId: string, text: string): Promise<SpaceMessage> {
    await delay(180);
    const message: SpaceMessage = {
      id: `sms-${Date.now()}`,
      spaceId,
      authorId: "me",
      authorName: mockCurrentUser.name,
      text,
      createdAt: new Date().toISOString(),
    };
    spaceMessages = [...spaceMessages, message];
    return message;
  },
  async trust(): Promise<TrustSummary> {
    await delay();
    return mockTrust;
  },
  async submitReport(draft: ReportDraft): Promise<ReportReceipt> {
    await delay(320);
    reports = [...reports, draft];
    return {
      id: `rep-${Date.now()}`,
      createdAt: new Date().toISOString(),
      reviewHours: 24,
    };
  },
  async submitVerification(draft: VerificationDraft): Promise<VerificationTicket> {
    await delay(900);
    lastVerification = draft;
    return {
      id: `ver-${Date.now()}`,
      status: "pending",
      submittedAt: new Date().toISOString(),
      etaMinutes: 15,
    };
  },
};
