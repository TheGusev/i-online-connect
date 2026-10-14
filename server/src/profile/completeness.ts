import { queryOne } from "../db.ts";
import { evaluateCompleteness, type Completeness } from "./completeness-rules.ts";

export * from "./completeness-rules.ts";

export async function loadCompleteness(userId: string): Promise<Completeness> {
  const row = await queryOne<{
    name: string | null;
    age: number | null;
    city: string | null;
    intent: string | null;
    bio: string | null;
    values_text: string | null;
    joy_text: string | null;
    interests: number;
    photos: number;
  }>(
    `SELECT p.name, p.age, p.city, p.intent::text AS intent, p.bio, p.values_text, p.joy_text,
            (SELECT count(*) FROM user_interests WHERE user_id = p.user_id)::int AS interests,
            (SELECT count(*) FROM profile_media WHERE user_id = p.user_id AND kind = 'photo')::int AS photos
       FROM profiles p WHERE p.user_id = $1`,
    [userId],
  );
  if (!row) return evaluateCompleteness({ name: null, age: null, city: null, intent: null, bio: null, interests: 0, valuesText: null, joyText: null, photos: 0 });
  return evaluateCompleteness({
    name: row.name,
    age: row.age,
    city: row.city,
    intent: row.intent,
    bio: row.bio,
    interests: row.interests,
    valuesText: row.values_text,
    joyText: row.joy_text,
    photos: row.photos,
  });
}

