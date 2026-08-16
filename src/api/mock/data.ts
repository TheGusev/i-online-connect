import type {
  Conversation,
  MatchCandidate,
  Message,
  Space,
  TrustSummary,
  User,
} from "../types";

export const mockUsers: User[] = [
  {
    id: "u1",
    name: "Анна",
    age: 27,
    city: "Новосибирск",
    bio: "Люблю горы, кофе и длинные разговоры о смысле.",
    interests: ["походы", "кофе", "фотография"],
    trustLevel: "verified",
    trustScore: 68,
    online: true,
  },
  {
    id: "u2",
    name: "Дмитрий",
    age: 31,
    city: "Москва",
    bio: "Инженер, играю в настольные игры, ищу спокойного человека рядом.",
    interests: ["настолки", "велосипед", "музыка"],
    trustLevel: "trusted",
    trustScore: 84,
    online: false,
  },
  {
    id: "u3",
    name: "Мария",
    age: 24,
    city: "Санкт-Петербург",
    bio: "Иллюстратор. Верю, что честный разговор важнее идеальной анкеты.",
    interests: ["рисование", "театр", "книги"],
    trustLevel: "new",
    trustScore: 32,
    online: true,
  },
  {
    id: "u4",
    name: "Игорь",
    age: 35,
    city: "Казань",
    bio: "Бегаю марафоны, готовлю плов, ценю прямоту.",
    interests: ["бег", "кулинария", "путешествия"],
    trustLevel: "ambassador",
    trustScore: 95,
    online: false,
  },
];

export const mockCurrentUser: User = {
  id: "me",
  name: "Максим",
  age: 29,
  city: "Новосибирск",
  bio: "Тестовый профиль до подключения реального API.",
  interests: ["технологии", "музыка"],
  trustLevel: "verified",
  trustScore: 61,
  online: true,
};

export const mockCandidates: MatchCandidate[] = mockUsers.map((user, index) => ({
  ...user,
  compatibility: 92 - index * 7,
  reasons: ["общий город", "похожие интересы", "активность в пространствах"].slice(
    0,
    (index % 3) + 1,
  ),
}));

export const mockConversations: Conversation[] = [
  {
    id: "c1",
    participant: { id: "u1", name: "Анна", online: true },
    lastMessage: "Договорились, тогда в субботу!",
    lastMessageAt: "2026-08-16T08:41:00.000Z",
    unreadCount: 2,
  },
  {
    id: "c2",
    participant: { id: "u2", name: "Дмитрий", online: false },
    lastMessage: "Скинь, пожалуйста, тот список игр",
    lastMessageAt: "2026-08-15T19:12:00.000Z",
    unreadCount: 0,
  },
  {
    id: "c3",
    participant: { id: "u4", name: "Игорь", online: false },
    lastMessage: "Спасибо за рекомендацию пространства",
    lastMessageAt: "2026-08-14T11:03:00.000Z",
    unreadCount: 0,
  },
];

export const mockMessages: Message[] = [
  {
    id: "m1",
    conversationId: "c1",
    authorId: "u1",
    text: "Привет! Как прошёл твой день?",
    createdAt: "2026-08-16T08:20:00.000Z",
  },
  {
    id: "m2",
    conversationId: "c1",
    authorId: "me",
    text: "Привет! Спокойно, работал. А у тебя?",
    createdAt: "2026-08-16T08:31:00.000Z",
  },
  {
    id: "m3",
    conversationId: "c1",
    authorId: "u1",
    text: "Договорились, тогда в субботу!",
    createdAt: "2026-08-16T08:41:00.000Z",
  },
  {
    id: "m4",
    conversationId: "c2",
    authorId: "u2",
    text: "Скинь, пожалуйста, тот список игр",
    createdAt: "2026-08-15T19:12:00.000Z",
  },
];

export const mockSpaces: Space[] = [
  {
    id: "s1",
    title: "Утренние прогулки",
    description: "Собираемся по выходным и гуляем по городу без спешки.",
    membersCount: 128,
    topic: "активность",
  },
  {
    id: "s2",
    title: "Книжный клуб «Тихо»",
    description: "Читаем одну книгу в месяц и обсуждаем без снобизма.",
    membersCount: 342,
    topic: "книги",
  },
  {
    id: "s3",
    title: "Новые в городе",
    description: "Пространство для тех, кто недавно переехал.",
    membersCount: 87,
    topic: "знакомства",
  },
];

export const mockTrust: TrustSummary = {
  level: "verified",
  score: 61,
  checks: [
    { id: "email", label: "Подтверждена почта", done: true },
    { id: "phone", label: "Подтверждён телефон", done: true },
    { id: "photo", label: "Проверка фотографии", done: false },
    { id: "document", label: "Проверка документа", done: false },
  ],
};
