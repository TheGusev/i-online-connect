import type {
  Conversation,
  DailyFeed,
  DailyMatch,
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

import match1 from "@/assets/match-1.jpg";
import match2 from "@/assets/match-2.jpg";
import match3 from "@/assets/match-3.jpg";
import match4 from "@/assets/match-4.jpg";
import match5 from "@/assets/match-5.jpg";

/** Дневная подборка: 5 человек в день, с объяснением совпадения от AI. */
export const mockDailyMatches: DailyMatch[] = [
  {
    id: "u1",
    name: "Анна",
    age: 27,
    city: "Новосибирск",
    bio: "Люблю горы, кофе и длинные разговоры о смысле.",
    interests: ["походы", "кофе", "фотография", "музыка"],
    trustLevel: "verified",
    trustScore: 68,
    online: true,
    compatibility: 92,
    reasons: ["походы", "тот же город"],
    quote: "Лучший разговор у меня случился на подъёме к перевалу, без связи и спешки.",
    photoUrl: match1,
    hasVideo: true,
    sharedInterests: ["походы", "кофе", "музыка"],
    aiExplanation:
      "Совпадение по интересу к походам и похожему взгляду на отношения: вы оба пишете, что хотите неспешного начала без гонки.",
    firstMessageHint:
      "Спроси про её последний маршрут — она сама начала разговор с истории про перевал.",
  },
  {
    id: "u2",
    name: "Дмитрий",
    age: 31,
    city: "Новосибирск",
    bio: "Инженер, играю в настольные игры, ищу спокойного человека рядом.",
    interests: ["настолки", "велосипед", "музыка", "технологии"],
    trustLevel: "trusted",
    trustScore: 84,
    online: false,
    compatibility: 88,
    reasons: ["музыка", "технологии"],
    quote: "Мне важно, чтобы рядом было тихо и понятно, без игр в угадайку.",
    photoUrl: match2,
    hasVideo: true,
    sharedInterests: ["музыка", "технологии"],
    aiExplanation:
      "Вы оба ищете спокойный темп общения и оба отметили музыку и технологии — есть о чём говорить дальше первого сообщения.",
    firstMessageHint:
      "Он ценит прямоту: напиши без вступлений, что тебя зацепило в его словах про «без угадайки».",
  },
  {
    id: "u3",
    name: "Мария",
    age: 24,
    city: "Новосибирск",
    bio: "Иллюстратор. Верю, что честный разговор важнее идеальной анкеты.",
    interests: ["рисование", "театр", "книги", "музыка"],
    trustLevel: "verified",
    trustScore: 57,
    online: true,
    compatibility: 81,
    reasons: ["творчество", "музыка"],
    quote: "Рисую людей в метро — почти каждый выглядит интереснее, чем думает о себе.",
    photoUrl: match3,
    hasVideo: false,
    sharedInterests: ["музыка", "театр"],
    aiExplanation:
      "Похожая мысль в ваших профилях: живой разговор важнее красивой анкеты. Плюс общий интерес к музыке и театру.",
    firstMessageHint: "Начни с вопроса про её наблюдения в метро — это её собственная фраза.",
  },
  {
    id: "u4",
    name: "Игорь",
    age: 35,
    city: "Новосибирск",
    bio: "Бегаю марафоны, готовлю плов, ценю прямоту.",
    interests: ["бег", "кулинария", "путешествия", "технологии"],
    trustLevel: "ambassador",
    trustScore: 95,
    online: false,
    compatibility: 76,
    reasons: ["бег", "путешествия"],
    quote: "Утро начинается с 10 километров, вечер — с большой кастрюли и гостей.",
    photoUrl: match4,
    hasVideo: true,
    sharedInterests: ["бег", "технологии"],
    aiExplanation:
      "Совпадение по утренним пробежкам и общему желанию встречаться офлайн, а не переписываться месяцами.",
    firstMessageHint: "Он часто зовёт на совместные пробежки — предложи конкретное утро.",
  },
  {
    id: "u5",
    name: "Ольга",
    age: 30,
    city: "Новосибирск",
    bio: "Читаю по книге в неделю, веду книжный клуб «Тихо».",
    interests: ["книги", "кофе", "театр", "прогулки"],
    trustLevel: "trusted",
    trustScore: 79,
    online: true,
    compatibility: 73,
    reasons: ["книги", "кофе"],
    quote: "Больше всего люблю разговоры, после которых хочется что-то перечитать.",
    photoUrl: match5,
    hasVideo: false,
    sharedInterests: ["книги", "кофе"],
    aiExplanation:
      "Вы оба отметили книги и спокойные вечера, и оба пришли в пространство «Книжный клуб «Тихо»».",
    firstMessageHint: "Спроси, что она читает сейчас — и что стоит перечитать тебе.",
  },
];

export const mockDailyFeed: DailyFeed = {
  matches: mockDailyMatches,
  dailyLimit: 5,
  nextRefreshAt: "",
};
