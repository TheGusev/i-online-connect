/**
 * Демо-наполнение платформы: примерные анкеты, объявления и сообщества.
 *
 * Зачем: пустое приложение выглядит мёртвым. Демо-записи помечены
 * is_seed = true, поэтому приложение само отодвигает и затем скрывает их,
 * как только появляются реальные люди (см. миграцию 009 и routes/listings.ts).
 *
 * Скрипт идемпотентный: повторный запуск ничего не дублирует — демо-аккаунты
 * узнаются по e-mail с доменом @seed.local, объявления и сообщества
 * пересоздаются только если их ещё нет.
 *
 * Запуск:  npm run seed          (нужен DATABASE_URL и доступ к MEDIA_DIR)
 * Очистка: npm run seed:clear
 */
import { randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import pg from "pg";

const here = path.dirname(fileURLToPath(import.meta.url));
const assetsDir = path.join(here, "..", "seed-assets");

async function loadEnvFile() {
  try {
    const raw = await readFile(path.join(here, "..", ".env"), "utf8");
    for (const line of raw.split("\n")) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (!match) continue;
      const [, key, value] = match;
      if (!(key in process.env)) process.env[key] = value.replace(/^["']|["']$/g, "");
    }
  } catch {
    /* .env может отсутствовать */
  }
}

await loadEnvFile();

if (!process.env.DATABASE_URL) {
  console.error("[seed] DATABASE_URL не задан. См. server/.env.example");
  process.exit(1);
}

const MEDIA_DIR = process.env.MEDIA_DIR ?? "/var/lib/ya-online/media";
const MEDIA_BASE_URL = (process.env.MEDIA_BASE_URL ?? "/api/media-file").replace(/\/$/, "");
const SEED_DOMAIN = "seed.local";

/** Пароль демо-аккаунтов неизвестен никому: вход в них невозможен. */
async function unusablePasswordHash() {
  try {
    const argon2 = await import("argon2");
    return await argon2.hash(randomUUID() + randomUUID());
  } catch {
    // argon2 — нативный модуль; если он недоступен, кладём строку, которая
    // никогда не совпадёт ни с одним паролем.
    return `seed-no-login-${randomUUID()}`;
  }
}

const CITIES = ["Новосибирск", "Москва", "Санкт-Петербург", "Екатеринбург"];
const DISTRICTS = {
  Новосибирск: ["Академгородок", "Центр", "Заельцовский", "Октябрьский"],
  Москва: ["Хамовники", "Сокол", "Басманный", "Черёмушки"],
  "Санкт-Петербург": ["Петроградская", "Васильевский остров", "Купчино", "Адмиралтейский"],
  Екатеринбург: ["Центр", "Уралмаш", "Академический", "Пионерский"],
};

const PHOTOS = [
  "person-01.jpg",
  "person-02.jpg",
  "person-03.jpg",
  "person-04.jpg",
  "person-05.jpg",
  "person-06.jpg",
  "person-07.jpg",
  "person-08.jpg",
];

const LISTING_PHOTOS = {
  dating: "listing-dating.jpg",
  service: "listing-service.jpg",
  realty: "listing-realty.jpg",
  transport: "listing-transport.jpg",
  sale: "listing-sale.jpg",
  leisure: "listing-leisure.jpg",
  travel: "listing-travel.jpg",
  help: "listing-help.jpg",
  urgent: "listing-help.jpg",
};

const PEOPLE = [
  ["Анна", 27, "serious", "Люблю утренние пробежки и тихие книжные вечера. Ищу спокойного человека рядом."],
  ["Дмитрий", 31, "serious", "Инженер, играю в бадминтон, готовлю лучший плов в районе."],
  ["Ольга", 24, "friends", "Учусь на архитектора, зову гулять по крышам и рисовать город."],
  ["Сергей", 44, "serious", "Читаю много, шумных компаний избегаю. Верю в спокойные разговоры."],
  ["Марина", 35, "friends", "Собираю людей на настолки по субботам, приходите даже без опыта."],
  ["Артём", 22, "friends", "Музыка, велосипед, дешёвые походы в горы. Люблю новые знакомства."],
  ["Елена", 52, "serious", "Готовлю, выращиваю зелень на балконе, ищу тёплое общение без спешки."],
  ["Никита", 26, "projects", "Бегаю марафоны и делаю приложения. Ищу партнёров по проектам и по бегу."],
  ["Ирина", 29, "serious", "Врач, ценю честность. В свободное время — плавание и хорошие сериалы."],
  ["Павел", 38, "friends", "Автолюбитель, помогу с переездом, зову на утренний кофе."],
  ["Ксения", 21, "friends", "Студентка-биолог, обожаю велопрогулки и уличные фестивали."],
  ["Роман", 33, "serious", "Работаю в школе, играю в шахматы, ищу человека для долгой дружбы."],
  ["Юлия", 41, "serious", "Двое детей, много юмора. Люблю театр и походы за грибами."],
  ["Максим", 28, "projects", "Фотограф. Ищу людей для съёмок города и просто хороших разговоров."],
  ["Дарья", 25, "friends", "Йога, растения, вязание. Не люблю громкие места, зато люблю парки."],
  ["Владимир", 47, "serious", "Строитель. Спокойный, обязательный, ценю прямые слова."],
  ["Алина", 30, "serious", "Дизайнер интерьеров, кофейный маньяк, зову смотреть выставки."],
  ["Егор", 23, "friends", "Скейт, электроника, ночные посиделки с гитарой."],
  ["Наталья", 36, "serious", "Бухгалтер, но душа за путешествия. Ищу компанию в дорогу."],
  ["Кирилл", 34, "projects", "Открываю маленькую кофейню, ищу друзей и партнёров рядом."],
  ["Вера", 45, "friends", "Волонтёр в приюте. Готова помочь и просто поболтать за чаем."],
  ["Игорь", 39, "serious", "Автомеханик. Помогу с машиной, люблю рыбалку и тишину."],
  ["Светлана", 32, "serious", "Преподаю английский, читаю по ночам, ищу спокойного человека."],
  ["Антон", 27, "friends", "Играю в футбол по средам, собираю команду в своём районе."],
  ["Полина", 26, "serious", "Кондитер. Пеку слишком много, зову дегустировать."],
  ["Григорий", 43, "friends", "Гуляю с собакой утром и вечером — присоединяйтесь."],
  ["Тамара", 49, "serious", "Люблю сад, вязание и долгие разговоры о жизни."],
  ["Данил", 24, "projects", "Пишу код и музыку. Ищу людей, с кем делать что-то своё."],
];

const LISTING_TEMPLATES = {
  dating: [
    ["Кофе в субботу утром", "Ищу спокойную компанию на утренний кофе рядом с домом. Без ожиданий — просто хороший разговор.", null],
    ["Прогулка по парку вечером", "Гуляю после работы почти каждый день. Буду рад(а) компании и разговорам обо всём.", null],
    ["Вместе на выставку", "Есть лишний билет на выставку в эти выходные. Ищу человека, с которым будет интересно.", null],
    ["Совместные завтраки по воскресеньям", "Люблю неспешные завтраки. Ищу человека рядом, кому это тоже близко.", null],
    ["Пойдём на пробежку вдвоём", "Одному лениво, вместе веселее. Темп спокойный, дистанция 5 км.", null],
    ["Настолки и чай", "Собираю пару человек на настолки дома у друзей. Атмосфера тихая, без алкоголя.", null],
    ["Знакомство за велопрогулкой", "Катаюсь по вечерам вдоль реки. Ищу компанию, маршрут покажу.", null],
    ["Сходим в кино на неделе", "Люблю старое кино и обсуждения после. Ищу человека с похожим вкусом.", null],
  ],
  service: [
    ["Уборка квартиры за 3 часа", "Работаю аккуратно и со своей химией. Двушку привожу в порядок за три часа.", 250000],
    ["Ремонт стиральных машин", "Опыт 9 лет, приезжаю со своим инструментом, диагностика бесплатно.", 150000],
    ["Репетитор английского", "Готовлю к экзаменам и подтягиваю разговорный. Первое занятие пробное.", 120000],
    ["Мастер по мебели", "Собираю и починю шкафы, кухни, кровати. Работаю в своём районе.", 200000],
    ["Стрижка на дому", "Женские и мужские стрижки, приеду к вам. Инструмент стерилизую.", 90000],
    ["Помощь с компьютером", "Настрою систему, почищу от вирусов, объясню простыми словами.", 100000],
    ["Выгул собак", "Гуляю утром и вечером, отчёт с фото. Есть опыт с крупными породами.", 50000],
    ["Няня на несколько часов", "Педагог по образованию, помогу с уроками и прогулкой.", 70000],
  ],
  realty: [
    ["Сдаю однушку рядом с метро", "Тёплая квартира с новым ремонтом, вся техника есть. Без посредников.", 3500000],
    ["Комната в двушке", "Комната 14 м², спокойные соседи, рядом парк и магазины.", 1500000],
    ["Ищу соседа в двушку", "Делим квартиру пополам, я работаю днём, дома тихо.", 1800000],
    ["Сдаю студию на месяц", "Всё для жизни: кухня, стиральная машина, быстрый интернет.", 3000000],
    ["Гараж рядом с домом", "Сухой, с ямой и светом. Отдаю в аренду на длительный срок.", 500000],
    ["Дом за городом на лето", "Шесть соток, баня, два часа на машине от города.", 4000000],
    ["Место под мастерскую", "Помещение 20 м² с отдельным входом, подойдёт для мастера.", 2500000],
    ["Ищу квартиру рядом", "Ищу однушку в этом районе на длительный срок, платим вовремя.", null],
  ],
  transport: [
    ["Продаю хэтчбек, один владелец", "Машина в родной краске, обслужена, вложений не требует.", 45000000],
    ["Перевезу вещи по городу", "Каблучок, помогу с погрузкой. Аккуратно и без спешки.", 150000],
    ["Отдам детское автокресло", "Кресло 9–18 кг, состояние хорошее, отдаю за символическую цену.", 300000],
    ["Ищу попутчика в аэропорт", "Выезжаю в 6 утра, места хватит двоим с чемоданами.", 60000],
    ["Продаю велосипед", "Городской велосипед на 7 скоростей, недавно перебрал.", 1200000],
    ["Зимние шины 4 штуки", "Комплект в отличном состоянии, отъездили один сезон.", 1600000],
    ["Подвезу до работы", "Каждое утро езжу через центр, могу забрать по пути.", 20000],
    ["Разовая помощь с прицепом", "Есть прицеп, помогу вывезти строительный мусор.", 200000],
  ],
  sale: [
    ["Отдам книги в хорошие руки", "Три коробки художественной литературы, всё в приличном состоянии.", 0],
    ["Электрический чайник", "Работает как новый, просто купили другой цвет.", 80000],
    ["Настольная лампа", "Тёплый свет, металлический абажур, отдам недорого.", 60000],
    ["Комод из дерева", "Крепкий комод, четыре ящика. Самовывоз с первого этажа.", 400000],
    ["Кофеварка гейзерная", "Пользовались редко, идёт вместе с помолом.", 120000],
    ["Настольные игры пачкой", "Пять игр для компании, все детали на месте.", 250000],
    ["Детская одежда 1–2 года", "Пакет вещей, всё чистое и целое. Отдам бесплатно.", 0],
    ["Гантели разборные", "Две по 10 кг, лежат без дела уже год.", 300000],
  ],
  leisure: [
    ["Настолки в субботу", "Собираемся каждую субботу, играем в «Каркассон» и что-то новое.", 0],
    ["Ищу компанию в бассейн", "Плаваю дважды в неделю, вдвоём дисциплины больше.", null],
    ["Утренний бег в парке", "Стартуем в 7:30, темп спокойный, ждём новых людей.", 0],
    ["Киновечер у нас дома", "Смотрим старое кино, потом обсуждаем за чаем.", 0],
    ["Волейбол по средам", "Не хватает двух человек, площадка оплачена.", 30000],
    ["Клуб разговорного английского", "Встречаемся в кафе, темы простые, уровень любой.", 0],
    ["Рисуем город акварелью", "Берите бумагу и краски, места покажу.", 0],
    ["Шахматы в парке", "По воскресеньям играем на свежем воздухе, доски есть.", 0],
  ],
  travel: [
    ["Едем в горы на выходные", "Две ночи в палатках, маршрут несложный, ищем ещё двоих.", 500000],
    ["Ищу попутчика на юг", "Едем машиной в конце месяца, делим бензин пополам.", 400000],
    ["Однодневная поездка на озеро", "Выезжаем в 8 утра, возвращаемся вечером. Есть два места.", 100000],
    ["Поход выходного дня", "20 км по лесной тропе, нужны хорошие ботинки и хорошее настроение.", 0],
    ["Прогулка на велосипедах за город", "Маршрут 40 км по асфальту, темп прогулочный.", 0],
    ["Ищу компанию в другой город", "Поеду на поезде на выходные, вдвоём интереснее.", null],
    ["Байдарки на два дня", "Есть свободная байдарка, снаряжение общее.", 700000],
    ["Экскурсия по старому центру", "Проведу бесплатно, просто люблю рассказывать про свой город.", 0],
  ],
  help: [
    ["Помогу с переездом", "Есть руки и машина, помогу перевезти вещи по городу.", 0],
    ["Нужна помощь с ремонтом полки", "Полка сорвалась со стены, сам не справлюсь.", null],
    ["Помогу пожилым с покупками", "Раз в неделю могу привезти продукты и вынести мусор.", 0],
    ["Ищу помощь с уроками ребёнку", "Математика, 6 класс. Готовы оплатить занятия.", 80000],
    ["Заберу и отвезу вещи в приют", "Собираю корм и пледы для приюта, заберу у вас сам.", 0],
    ["Нужен человек посидеть с кошкой", "Уезжаю на три дня, надо кормить и менять воду.", 100000],
    ["Помогу разобраться с документами", "Работаю с бумагами, подскажу, куда и что нести.", 0],
    ["Нужна помощь донести мебель", "Диван на четвёртый этаж без лифта, нужны двое.", 150000],
  ],
  urgent: [
    ["Срочно нужен зарядник от ноутбука", "Уехал в командировку и забыл. Верну сегодня же.", null],
    ["Срочно нужна помощь с колесом", "Пробил колесо у дома, нет домкрата.", null],
    ["Срочно ищу человека с машиной", "Надо отвезти кота к врачу в течение часа, оплачу.", 100000],
    ["Срочно нужен фен для сушки", "Прорвало трубу, нужно быстро подсушить пол.", null],
    ["Нужен инструмент на вечер", "Перфоратор на час, верну сразу же.", null],
    ["Срочно нужна замена на смену", "Не могу выйти в утреннюю смену, ищу подмену.", 200000],
    ["Пропала кошка во дворе", "Серая, с белой грудкой. Помогите поискать.", null],
    ["Нужны двое помочь занести вещи", "Приехала доставка, лифт не работает.", 100000],
  ],
};

const SPACES = [
  ["Утренний бег в парке", "sport", "Бегаем по вторникам и субботам в 7:30. Темп спокойный, ждём новых людей.", "space-sport.jpg"],
  ["Книжный клуб «Тихая полка»", "culture", "Одна книга в месяц и один тёплый вечер обсуждения.", "space-books.jpg"],
  ["Готовим вместе", "food", "Собираемся на кухне у кого-нибудь и готовим большое блюдо на всех.", "listing-service.jpg"],
  ["Настолки по субботам", "games", "Каркассон, Codenames и новые игры. Приходить можно без опыта.", "listing-leisure.jpg"],
  ["Походы выходного дня", "sport", "Каждые две недели уезжаем на день в лес или к воде.", "listing-travel.jpg"],
  ["IT-посиделки", "professional", "Обсуждаем проекты, помогаем друг другу с задачами, иногда делаем что-то вместе.", "listing-sale.jpg"],
  ["Добрые дела в районе", "city", "Помогаем соседям, приюту и просто друг другу.", "listing-help.jpg"],
];

const SPACE_MESSAGES = [
  "Всем привет! Кто идёт в эти выходные?",
  "Я буду, возьму с собой термос.",
  "Отлично, встречаемся у входа в парк.",
  "Можно с собой друга привести?",
  "Конечно, чем больше, тем лучше.",
];

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

async function ensureSeedColumns() {
  const { rows } = await client.query(
    "SELECT 1 FROM information_schema.columns WHERE table_name = 'listings' AND column_name = 'is_seed'",
  );
  if (rows.length === 0) {
    console.error("[seed] нет колонки is_seed. Сначала выполните: npm run migrate");
    process.exit(1);
  }
}

/** Копия файла из seed-assets в медиа-хранилище пользователя. */
async function copyAsset(userId, asset) {
  const dir = path.join(MEDIA_DIR, userId);
  await mkdir(dir, { recursive: true, mode: 0o755 });
  const name = `${randomUUID()}${path.extname(asset)}`;
  await copyFile(path.join(assetsDir, asset), path.join(dir, name));
  return `${MEDIA_BASE_URL}/${userId}/${name}`;
}

async function seedProfiles() {
  const interests = (await client.query("SELECT id FROM interests")).rows.map((row) => row.id);
  const created = [];

  for (const [index, [name, age, intent, bio]] of PEOPLE.entries()) {
    const email = `demo${String(index + 1).padStart(2, "0")}@${SEED_DOMAIN}`;
    const existing = await client.query("SELECT id FROM users WHERE email = $1", [email]);
    if (existing.rows.length > 0) {
      created.push({ id: existing.rows[0].id, city: null, fresh: false });
      continue;
    }

    const city = CITIES[index % CITIES.length];
    const hash = await unusablePasswordHash();
    const { rows } = await client.query(
      `INSERT INTO users (email, password_hash, email_verified, last_seen_at)
       VALUES ($1, $2, true, now() - make_interval(mins => $3::int))
       RETURNING id`,
      [email, hash, (index % 7) * 40],
    );
    const userId = rows[0].id;

    await client.query(
      `INSERT INTO profiles (user_id, name, age, city, bio, intent, trust_level, trust_score,
                             video_verified, safe_meetings, clean_conversations, onboarded_at, is_seed)
       VALUES ($1, $2, $3, $4, $5, $6::profile_intent, $7::trust_level, $8, $9, $10, $11, now(), true)`,
      [
        userId,
        name,
        age,
        city,
        bio,
        intent,
        index % 3 === 0 ? "verified" : "new",
        40 + ((index * 7) % 55),
        index % 3 === 0,
        index % 4,
        3 + (index % 9),
      ],
    );
    await client.query(
      "INSERT INTO privacy_settings (user_id) VALUES ($1) ON CONFLICT DO NOTHING",
      [userId],
    );
    await client.query(
      "INSERT INTO notification_prefs (user_id) VALUES ($1) ON CONFLICT DO NOTHING",
      [userId],
    );

    // Интересы: три штуки по кругу, чтобы совпадения выглядели правдоподобно.
    for (let step = 0; step < 3 && interests.length > 0; step += 1) {
      const interestId = interests[(index * 3 + step) % interests.length];
      await client.query(
        "INSERT INTO user_interests (user_id, interest_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [userId, interestId],
      );
    }

    // Два-три фото: каскадная карусель профиля должна быть видна.
    const count = 2 + (index % 2);
    for (let position = 0; position < count; position += 1) {
      const asset = PHOTOS[(index + position) % PHOTOS.length];
      const url = await copyAsset(userId, asset);
      await client.query(
        `INSERT INTO profile_media (user_id, kind, url, position, is_primary)
         VALUES ($1, 'photo', $2, $3, $4)`,
        [userId, url, position, position === 0],
      );
    }

    created.push({ id: userId, city, fresh: true });
  }

  return created;
}

async function seedListings(users) {
  const perCategory = {};
  for (const [category, templates] of Object.entries(LISTING_TEMPLATES)) {
    perCategory[category] = 0;
    for (const [index, [title, description, priceMinor]] of templates.entries()) {
      const author = users[(index * 3 + templates.length) % users.length];
      const profile = await client.query("SELECT city FROM profiles WHERE user_id = $1", [
        author.id,
      ]);
      const city = profile.rows[0]?.city ?? CITIES[0];
      const districts = DISTRICTS[city] ?? [""];
      const district = districts[index % districts.length];

      const existing = await client.query(
        "SELECT id FROM listings WHERE is_seed AND title = $1 AND city = $2",
        [title, city],
      );
      if (existing.rows.length > 0) continue;

      const { rows } = await client.query(
        `INSERT INTO listings (author_id, category, city, district, title, description,
                               price_minor, state, expires_at, is_seed, created_at)
         VALUES ($1, $2::need_category, $3, $4, $5, $6, $7, 'active',
                 now() + interval '60 days', true, now() - make_interval(hours => $8::int))
         RETURNING id`,
        [author.id, category, city, district, title, description, priceMinor, index * 5],
      );
      const listingId = rows[0].id;

      const asset = LISTING_PHOTOS[category];
      if (asset) {
        const url = await copyAsset(author.id, asset);
        const media = await client.query(
          `INSERT INTO profile_media (user_id, kind, url, position, is_primary)
           VALUES ($1, 'photo', $2, 90, false) RETURNING id`,
          [author.id, url],
        );
        await client.query(
          "INSERT INTO listing_media (listing_id, media_id, position) VALUES ($1, $2, 0)",
          [listingId, media.rows[0].id],
        );
      }

      perCategory[category] += 1;
    }
  }
  return perCategory;
}

async function seedSpaces(users) {
  let count = 0;
  for (const [index, [title, category, description, cover]] of SPACES.entries()) {
    const existing = await client.query("SELECT id FROM spaces WHERE is_seed AND title = $1", [
      title,
    ]);
    if (existing.rows.length > 0) continue;

    const host = users[(index * 4) % users.length];
    const city = (await client.query("SELECT city FROM profiles WHERE user_id = $1", [host.id]))
      .rows[0]?.city ?? CITIES[0];
    const coverUrl = await copyAsset(host.id, cover);

    const { rows } = await client.query(
      `INSERT INTO spaces (title, description, topic, cover_url, category, format, cadence,
                           city, verified_community, join_policy, host_id, is_seed)
       VALUES ($1, $2, '', $3, $4::space_category, 'offline', 'weekly', $5, $6, 'open', $7, true)
       RETURNING id`,
      [title, description, coverUrl, category, city, index % 2 === 0, host.id],
    );
    const spaceId = rows[0].id;

    await client.query(
      `INSERT INTO space_members (space_id, user_id, status) VALUES ($1, $2, 'host')
       ON CONFLICT DO NOTHING`,
      [spaceId, host.id],
    );

    const members = [];
    for (let step = 1; step <= 6; step += 1) {
      const member = users[(index * 4 + step) % users.length];
      if (member.id === host.id) continue;
      members.push(member.id);
      await client.query(
        `INSERT INTO space_members (space_id, user_id, status) VALUES ($1, $2, 'member')
         ON CONFLICT DO NOTHING`,
        [spaceId, member.id],
      );
    }

    for (const [messageIndex, text] of SPACE_MESSAGES.entries()) {
      const authorId = messageIndex === 0 ? host.id : members[messageIndex % members.length];
      await client.query(
        `INSERT INTO space_messages (space_id, author_id, text, is_seed, created_at)
         VALUES ($1, $2, $3, true, now() - make_interval(hours => $4::int))`,
        [spaceId, authorId, text, SPACE_MESSAGES.length - messageIndex],
      );
    }

    // Ближайшая встреча — сообщество выглядит живым.
    await client.query(
      `INSERT INTO space_events (space_id, title, starts_at, place, created_by)
       VALUES ($1, $2, now() + make_interval(days => $3::int), $4, $5)`,
      [spaceId, "Встреча на этой неделе", 2 + (index % 5), `${city}, центр`, host.id],
    );

    count += 1;
  }
  return count;
}

await ensureSeedColumns();

const users = await seedProfiles();
const listings = await seedListings(users);
const spaces = await seedSpaces(users);

await client.end();

const fresh = users.filter((user) => user.fresh).length;
console.log("[seed] готово");
console.log(`  анкеты: всего демо ${users.length}, создано сейчас ${fresh}`);
for (const [category, count] of Object.entries(listings)) {
  console.log(`  объявления «${category}»: создано ${count}`);
}
console.log(`  сообщества: создано ${spaces}`);
console.log("  очистить всё демо: npm run seed:clear");
