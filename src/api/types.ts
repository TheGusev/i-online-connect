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
  /** Главное фото профиля: аватар в шапке и в списках. */
  avatarUrl?: string;
}


export interface MatchCandidate extends User {
  compatibility: number;
  reasons: string[];
}

export interface ConversationParticipant extends Pick<User, "id" | "name" | "online"> {
  avatarUrl?: string;
  trustLevel: TrustLevel;
  city?: string;
}

export interface Conversation {
  id: string;
  participant: ConversationParticipant;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
  /** Собеседник написал, а ответа от вас ещё не было. */
  awaitingReply: boolean;
  /** Совпадающие интересы — основа для подсказок первой фразы. */
  sharedInterests: string[];
  /** Последнее сообщение отправлено вами. */
  lastMessageFromMe: boolean;
}

export type MessageStatus = "sending" | "sent" | "read";

export interface Message {
  id: string;
  conversationId: string;
  authorId: string;
  text: string;
  createdAt: string;
  status?: MessageStatus;
  /** Системное сообщение: приглашение на встречу и подобное. */
  kind?: "text" | "meeting";
}

/** Тип встречи в мини-форме «Предложить встречу». */
export type MeetingKind = "coffee" | "walk" | "event";

/** Категория сообщества. */
export type SpaceCategory =
  | "sport"
  | "games"
  | "professional"
  | "culture"
  | "food"
  | "city";

/** Формат встреч сообщества. */
export type SpaceFormat = "offline" | "online" | "mixed";

/** Как часто сообщество собирается. */
export type SpaceCadence = "weekly" | "biweekly" | "monthly" | "occasional";

/**
 * Мягкая модерация входа: открытые сообщества по интересам пускают сразу,
 * более приватные — после короткого вопроса организатора.
 */
export type SpaceJoinPolicy = "open" | "question";

export interface SpaceEvent {
  id: string;
  spaceId: string;
  title: string;
  /** ISO-дата начала. */
  startsAt: string;
  place: string;
  goingCount: number;
  going: boolean;
}

export interface SpaceMember {
  id: string;
  name: string;
  avatarUrl?: string | undefined;
  /** Организатор сообщества. */
  host?: boolean | undefined;
}

export interface SpaceMessage {
  id: string;
  spaceId: string;
  authorId: string;
  authorName: string;
  text: string;
  createdAt: string;
}

export interface Space {
  id: string;
  title: string;
  description: string;
  membersCount: number;
  topic: string;
  coverUrl: string;
  category: SpaceCategory;
  format: SpaceFormat;
  cadence: SpaceCadence;
  city: string;
  /** Расстояние до места встреч, км — для таба «Рядом». */
  distanceKm: number;
  /** Модерация подтвердила, что сообщество живое. */
  verifiedCommunity: boolean;
  joinPolicy: SpaceJoinPolicy;
  /** Вопрос организатора при входе, если joinPolicy = question. */
  joinQuestion?: string | undefined;
  interests: string[];
  isMember: boolean;
  /** Заявка отправлена организатору и ждёт ответа. */
  pendingRequest?: boolean | undefined;
  nextEvent?: SpaceEvent | undefined;
}

/** Отдельное пространство: описание, участники, события, групповой чат. */
export interface SpaceDetail extends Space {
  hostName: string;
  members: SpaceMember[];
  events: SpaceEvent[];
}

/** Черновик нового сообщества из формы «Создать пространство». */
export interface SpaceDraft {
  title: string;
  description: string;
  category: SpaceCategory;
  format: SpaceFormat;
  cadence: SpaceCadence;
  city: string;
  coverUrl?: string | undefined;
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

/** Намерение, с которым человек пришёл на платформу. */
export type ProfileIntent = "serious" | "friends" | "projects";

export interface ProfileMedia {
  id: string;
  kind: "photo" | "video";
  url: string;
  /** Главное фото: аватар профиля и основа для видео-верификации. */
  isPrimary?: boolean;
}


/** Расшифровка бейджа доверия — то, что видно другим людям (без баллов). */
export interface TrustDetails {
  videoVerified: boolean;
  monthsOnPlatform: number;
  safeMeetings: number;
}

/** Публичный профиль человека. */
export interface ProfileDetail extends User {
  media: ProfileMedia[];
  intent: ProfileIntent;
  intentNote: string;
  values: string[];
  trust: TrustDetails;
}

export type VerificationStatus = "none" | "pending" | "verified" | "rejected";

export interface PrivacySettings {
  /** Кто видит точную геолокацию. */
  exactLocation: "nobody" | "matches" | "everyone";
  /** Профиль участвует в дневных подборках. */
  visibleInFeed: boolean;
  /** Кто может написать первым. */
  whoCanMessage: "everyone" | "verified" | "matches";
}

/** Приватная статистика доверия: видна только владельцу профиля. */
export interface OwnerTrustStats {
  cleanConversations: number;
  safeMeetings: number;
  joinedAt: string;
}

/** Свой профиль: публичная часть + приватные настройки и статистика. */
export interface MyProfile extends ProfileDetail {
  privacy: PrivacySettings;
  verification: VerificationStatus;
  stats: OwnerTrustStats;
}

export type ReportCategory = "fake" | "behavior" | "scam" | "other";

export interface ReportDraft {
  category: ReportCategory;
  details: string;
  /** Кого или что обжалуют. */
  subjectId: string;
  subjectName?: string;
  /** Откуда пришла жалоба — из чата или из профиля. */
  source: "chat" | "profile";
  blockToo?: boolean;
}

export interface ReportReceipt {
  id: string;
  createdAt: string;
  /** Ожидаемое время ответа модерации в часах. */
  reviewHours: number;
}

/** Одноразовое задание для живого видео: генерирует сервер. */
export interface VerificationChallenge {
  id: string;
  /** Что нужно сделать перед камерой. */
  instructions: string[];
  /** Код, который нужно произнести вслух. */
  spokenCode: string;
  expiresAt: string;
  /** Фото профиля, с которым сверяем. */
  referencePhotoUrl: string;
}

export interface VerificationTicket {
  id: string | null;
  status: VerificationStatus;
  submittedAt: string | null;
  /** Человеческое объяснение результата или причины отказа. */
  reason: string;
  /** Сколько обычно занимает проверка, в минутах. */
  etaMinutes: number;
}

/** Контактные данные и язык интерфейса. */
export interface AccountSettings {
  email: string;
  phone: string;
  /** Язык интерфейса: код i18n. */
  language: string;
  emailVerified: boolean;
  phoneVerified: boolean;
}

export type NotificationChannel = "matches" | "messages" | "spaces" | "safety";

/** Переключатели уведомлений по типам событий. */
export type NotificationSettings = Record<NotificationChannel, boolean>;

export type PlanId = "basic" | "premium";

/** Текущий тариф. Оплата появится позже — сейчас только UI. */
export interface SubscriptionInfo {
  plan: PlanId;
  planName: string;
  priceLabel: string;
  since: string;
  premiumFeatures: { title: string; description: string }[];
}

/** Все настройки одним запросом. */
export interface SettingsBundle {
  account: AccountSettings;
  notifications: NotificationSettings;
  subscription: SubscriptionInfo;
}

export type DeleteReason = "found-someone" | "too-few-matches" | "privacy" | "break" | "other";

export interface DeleteAccountRequest {
  reason?: DeleteReason;
  comment?: string;
}

export interface DeleteAccountReceipt {
  id: string;
  /** Сколько дней аккаунт можно восстановить. */
  restoreDays: number;
}

export interface PasswordChange {
  current: string;
  next: string;
}
