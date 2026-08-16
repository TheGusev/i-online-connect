import type { SpaceDetail, SpaceEvent, SpaceMessage } from "../types";

import coverRun from "@/assets/space-run.jpg";
import coverBoardgames from "@/assets/space-boardgames.jpg";
import coverIt from "@/assets/space-it.jpg";
import coverWalk from "@/assets/space-walk.jpg";
import coverBooks from "@/assets/space-books.jpg";
import coverCook from "@/assets/space-cook.jpg";

import match1 from "@/assets/match-1.jpg";
import match2 from "@/assets/match-2.jpg";
import match3 from "@/assets/match-3.jpg";
import match4 from "@/assets/match-4.jpg";
import match5 from "@/assets/match-5.jpg";

/** Даты событий считаются от «сегодня», чтобы моки не устаревали. */
function inDays(days: number, hour = 10, minute = 0) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

function event(
  spaceId: string,
  id: string,
  title: string,
  startsAt: string,
  place: string,
  goingCount: number,
): SpaceEvent {
  return { id, spaceId, title, startsAt, place, goingCount, going: false };
}

const avatars = [match1, match2, match3, match4, match5];

function members(names: string[]): SpaceDetail["members"] {
  return names.map((name, index) => ({
    id: `sm-${name}-${index}`,
    name,
    avatarUrl: avatars[index % avatars.length] ?? avatars[0]!,
    host: index === 0,
  }));
}

export const mockSpaceDetails: SpaceDetail[] = [
  {
    id: "s1",
    title: "Утренние пробежки по выходным",
    description:
      "Собираемся в субботу и воскресенье в 8:00 у входа в парк. Темп спокойный: главное — выйти из дома и поболтать по пути. Новичкам помогаем с дистанцией, никто никого не гонит.",
    membersCount: 128,
    topic: "активность",
    coverUrl: coverRun,
    category: "sport",
    format: "offline",
    cadence: "weekly",
    city: "Новосибирск",
    distanceKm: 1.8,
    verifiedCommunity: true,
    joinPolicy: "open",
    interests: ["бег", "утро", "парк"],
    isMember: true,
    hostName: "Игорь",
    members: members(["Игорь", "Анна", "Мария", "Дмитрий", "Лена", "Павел", "Настя"]),
    events: [
      event("s1", "e1", "Субботняя пробежка 5 км", inDays(2, 8), "Центральный парк, главный вход", 14),
      event("s1", "e2", "Воскресный лёгкий забег", inDays(3, 8, 30), "Набережная, у моста", 9),
    ],
  },
  {
    id: "s2",
    title: "Настолки в центре города",
    description:
      "Каждую пятницу играем в кооперативные и лёгкие пати-игры в кафе на Ленина. Правила объясняем на месте, приходить можно одному — за столом всегда найдётся место.",
    membersCount: 214,
    topic: "игры",
    coverUrl: coverBoardgames,
    category: "games",
    format: "offline",
    cadence: "weekly",
    city: "Новосибирск",
    distanceKm: 3.4,
    verifiedCommunity: true,
    joinPolicy: "open",
    interests: ["настолки", "кафе", "вечера"],
    isMember: false,
    hostName: "Дмитрий",
    members: members(["Дмитрий", "Мария", "Игорь", "Анна", "Рома", "Юля"]),
    events: [
      event("s2", "e3", "Игровая пятница", inDays(4, 19), "Кафе «Полка», Ленина 12", 18),
      event("s2", "e4", "Вечер стратегий", inDays(11, 19), "Кафе «Полка», Ленина 12", 7),
    ],
  },
  {
    id: "s3",
    title: "IT-предприниматели Новосибирска",
    description:
      "Небольшой круг людей, которые делают продукты и не боятся говорить о провалах. Раз в месяц — офлайн-ужин, между встречами обсуждаем нанимающие вопросы и клиентов в чате.",
    membersCount: 62,
    topic: "профессия",
    coverUrl: coverIt,
    category: "professional",
    format: "mixed",
    cadence: "monthly",
    city: "Новосибирск",
    distanceKm: 5.1,
    verifiedCommunity: true,
    joinPolicy: "question",
    joinQuestion: "Расскажите в двух предложениях, чем вы занимаетесь и что хотите обсудить в сообществе.",
    interests: ["продукты", "стартапы", "нетворкинг"],
    isMember: false,
    hostName: "Павел",
    members: members(["Павел", "Дмитрий", "Анна", "Кирилл", "Лиза"]),
    events: [
      event("s3", "e5", "Ужин без питчей", inDays(9, 19, 30), "Ресторан «Цех», Красный проспект", 11),
    ],
  },
  {
    id: "s4",
    title: "Прогулки по неочевидным районам",
    description:
      "Гуляем два раза в месяц по местам, куда обычно не заходят: дворы, заводские кварталы, старые кинотеатры. После прогулки — чай в ближайшей кофейне.",
    membersCount: 96,
    topic: "город",
    coverUrl: coverWalk,
    category: "city",
    format: "offline",
    cadence: "biweekly",
    city: "Новосибирск",
    distanceKm: 2.2,
    verifiedCommunity: false,
    joinPolicy: "open",
    interests: ["прогулки", "архитектура", "фотография"],
    isMember: true,
    hostName: "Анна",
    members: members(["Анна", "Мария", "Игорь", "Соня"]),
    events: [
      event("s4", "e6", "Двор-колодец и заводской квартал", inDays(6, 12), "Метро «Октябрьская»", 12),
    ],
  },
  {
    id: "s5",
    title: "Книжный клуб «Тихо»",
    description:
      "Читаем одну книгу в месяц и обсуждаем без снобизма. Не дочитал — всё равно приходи, спойлеры не считаются преступлением.",
    membersCount: 342,
    topic: "книги",
    coverUrl: coverBooks,
    category: "culture",
    format: "mixed",
    cadence: "monthly",
    city: "Новосибирск",
    distanceKm: 7.8,
    verifiedCommunity: true,
    joinPolicy: "open",
    interests: ["книги", "обсуждения", "чай"],
    isMember: false,
    hostName: "Мария",
    members: members(["Мария", "Лена", "Анна", "Игорь", "Настя", "Юля", "Соня"]),
    events: [
      event("s5", "e7", "Обсуждаем «Стоунер»", inDays(13, 18), "Библиотека на Гоголя + Zoom", 24),
    ],
  },
  {
    id: "s6",
    title: "Готовим вместе по субботам",
    description:
      "Небольшая компания, которая раз в две недели готовит ужин у кого-то дома. Вход через вопрос организатору — важно, чтобы всем было спокойно в чужой кухне.",
    membersCount: 38,
    topic: "еда",
    coverUrl: coverCook,
    category: "food",
    format: "offline",
    cadence: "biweekly",
    city: "Новосибирск",
    distanceKm: 4.6,
    verifiedCommunity: false,
    joinPolicy: "question",
    joinQuestion: "Что вы умеете готовить и какой ужин хотели бы сделать вместе?",
    interests: ["еда", "готовка", "домашние ужины"],
    isMember: false,
    hostName: "Лена",
    members: members(["Лена", "Павел", "Мария", "Кирилл"]),
    events: [
      event("s6", "e8", "Паста с нуля", inDays(8, 18), "Дом у Лены, Богдана Хмельницкого", 6),
    ],
  },
];

export const mockSpaceMessages: SpaceMessage[] = [
  {
    id: "sms-1",
    spaceId: "s1",
    authorId: "u4",
    authorName: "Игорь",
    text: "В субботу прогноз обещает +14 и без дождя — бежим по обычному маршруту.",
    createdAt: inDays(-1, 20, 12),
  },
  {
    id: "sms-2",
    spaceId: "s1",
    authorId: "u1",
    authorName: "Анна",
    text: "Буду! Возьму термос, после пробежки можно постоять погреться.",
    createdAt: inDays(-1, 20, 40),
  },
  {
    id: "sms-3",
    spaceId: "s1",
    authorId: "u3",
    authorName: "Мария",
    text: "Я новичок, 5 км пока много. Можно с вами первые пару километров?",
    createdAt: inDays(0, 9, 5),
  },
  {
    id: "sms-4",
    spaceId: "s2",
    authorId: "u2",
    authorName: "Дмитрий",
    text: "На пятницу забронировал большой стол. Приносите свои игры, если хочется.",
    createdAt: inDays(-2, 18, 0),
  },
  {
    id: "sms-5",
    spaceId: "s4",
    authorId: "u1",
    authorName: "Анна",
    text: "Маршрут на эту прогулку короче обычного, около часа с остановками.",
    createdAt: inDays(-1, 12, 30),
  },
];
