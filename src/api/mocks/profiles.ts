import type { MyProfile, ProfileDetail } from "../types";

import landingHero from "@/assets/landing-hero.jpg";
import landingMeet from "@/assets/landing-meet.jpg";
import match1 from "@/assets/match-1.jpg";
import match2 from "@/assets/match-2.jpg";
import match3 from "@/assets/match-3.jpg";
import match4 from "@/assets/match-4.jpg";
import match5 from "@/assets/match-5.jpg";

/** Публичные профили: несколько медиа, намерение, ценности и расшифровка доверия. */
export const mockProfileDetails: ProfileDetail[] = [
  {
    id: "u1",
    name: "Анна",
    age: 27,
    city: "Новосибирск",
    bio: "Люблю горы, кофе и длинные разговоры о смысле. Работаю в проектировании, по выходным уезжаю за город. Не жду идеального совпадения — жду человека, с которым спокойно молчать.",
    interests: ["походы", "кофе", "фотография", "музыка"],
    trustLevel: "verified",
    trustScore: 68,
    online: true,
    media: [
      { id: "m1", kind: "video", url: match1 },
      { id: "m2", kind: "photo", url: landingHero },
      { id: "m3", kind: "photo", url: landingMeet },
    ],
    intent: "serious",
    intentNote: "Хочу отношения, которые начинаются с разговоров, а не с гонки.",
    values: ["Честность важнее удобства", "Своё пространство у каждого", "Спокойный темп"],
    trust: { videoVerified: true, monthsOnPlatform: 3, safeMeetings: 4 },
  },
  {
    id: "u2",
    name: "Дмитрий",
    age: 31,
    city: "Новосибирск",
    bio: "Инженер, играю в настольные игры, ищу спокойного человека рядом. Люблю понятные договорённости и вечера без спешки.",
    interests: ["настолки", "велосипед", "музыка", "технологии"],
    trustLevel: "trusted",
    trustScore: 84,
    online: false,
    media: [
      { id: "m1", kind: "photo", url: match2 },
      { id: "m2", kind: "photo", url: landingMeet },
    ],
    intent: "serious",
    intentNote: "Ищу человека на долгую дистанцию, без игр в угадайку.",
    values: ["Прямой разговор", "Надёжность в мелочах", "Без ревности к чужим планам"],
    trust: { videoVerified: true, monthsOnPlatform: 7, safeMeetings: 6 },
  },
  {
    id: "u3",
    name: "Мария",
    age: 24,
    city: "Санкт-Петербург",
    bio: "Иллюстратор. Верю, что честный разговор важнее идеальной анкеты. Рисую людей в метро и веду небольшой блог.",
    interests: ["рисование", "театр", "книги", "музыка"],
    trustLevel: "verified",
    trustScore: 57,
    online: true,
    media: [
      { id: "m1", kind: "video", url: match3 },
      { id: "m2", kind: "photo", url: landingHero },
    ],
    intent: "friends",
    intentNote: "Пока хочу тёплого общения и компанию для выставок.",
    values: ["Любопытство", "Бережность в словах", "Право на паузу"],
    trust: { videoVerified: true, monthsOnPlatform: 1, safeMeetings: 1 },
  },
  {
    id: "u4",
    name: "Игорь",
    age: 35,
    city: "Казань",
    bio: "Бегаю марафоны, готовлю плов, ценю прямоту. Считаю, что лучшее знакомство случается на общем деле.",
    interests: ["бег", "кулинария", "путешествия", "технологии"],
    trustLevel: "ambassador",
    trustScore: 95,
    online: false,
    media: [
      { id: "m1", kind: "photo", url: match4 },
      { id: "m2", kind: "photo", url: landingMeet },
    ],
    intent: "projects",
    intentNote: "Собираю людей на совместные забеги и городские проекты.",
    values: ["Слово держится", "Общее дело сближает", "Без токсичности"],
    trust: { videoVerified: true, monthsOnPlatform: 14, safeMeetings: 12 },
  },
  {
    id: "u5",
    name: "Ольга",
    age: 30,
    city: "Новосибирск",
    bio: "Читаю по книге в неделю, веду книжный клуб «Тихо». Люблю разговоры, после которых хочется что-то перечитать.",
    interests: ["книги", "кофе", "театр", "прогулки"],
    trustLevel: "trusted",
    trustScore: 79,
    online: true,
    media: [
      { id: "m1", kind: "photo", url: match5 },
      { id: "m2", kind: "photo", url: landingHero },
    ],
    intent: "friends",
    intentNote: "Ищу собеседников и людей в клуб, а дальше — как пойдёт.",
    values: ["Внимание к деталям", "Тишина как норма", "Уважение к границам"],
    trust: { videoVerified: true, monthsOnPlatform: 5, safeMeetings: 3 },
  },
];

/** Свой профиль с приватными настройками и личной статистикой доверия. */
export const mockMyProfile: MyProfile = {
  id: "me",
  name: "Максим",
  age: 29,
  city: "Новосибирск",
  bio: "Проектирую интерфейсы, много гуляю и люблю разговоры без спешки. Ищу человека, с которым интересно вдвоём и спокойно по отдельности.",
  interests: ["технологии", "музыка", "прогулки", "кино"],
  trustLevel: "verified",
  trustScore: 61,
  online: true,
  media: [
    { id: "m1", kind: "photo", url: landingHero },
    { id: "m2", kind: "photo", url: landingMeet },
  ],
  intent: "serious",
  intentNote: "Хочу серьёзные отношения, но без спешки и без сценариев.",
  values: ["Честность", "Своё пространство", "Без игр в молчанку"],
  trust: { videoVerified: true, monthsOnPlatform: 2, safeMeetings: 2 },
  privacy: { exactLocation: "matches", visibleInFeed: true, whoCanMessage: "verified" },
  verification: "verified",
  stats: { cleanConversations: 12, safeMeetings: 2, joinedAt: "2026-06-14T00:00:00.000Z" },
};
