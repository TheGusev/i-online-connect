import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { currentUserId, requireAuth } from '../auth/middleware.ts';
import { query, queryOne } from '../db.ts';
import { notFound } from '../http.ts';
import { cityKey } from '../seed/regional-policy.ts';
import { ensureRegionalCommunities } from '../seed/regional-store.ts';

type PlaceRow = {
  id: string;
  city: string;
  regionId: string;
  regionalCenter: string;
};
const SELECT_PLACE = `SELECT g.id, g.city, g.region_id AS "regionId", r.center_city AS "regionalCenter"
  FROM geo_places g JOIN demo_regions r ON r.id = g.region_id`;

// Must be registered with prefix /api/geo. All writes require authentication.
export async function geoRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  app.get('/places', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async request => {
    const { q } = z.object({ q: z.string().trim().min(2).max(120) }).parse(request.query);
    const key = cityKey(q).replace(/[\\%_]/g, '\\$&');
    const items = await query<PlaceRow>(`${SELECT_PLACE}
      WHERE g.normalized_name LIKE $1 ESCAPE '\\'
      ORDER BY g.city, g.region_id LIMIT 20`, [`${key}%`]);
    return { items, directoryOnly: true };
  });

  app.get('/me', async request => {
    const userId = currentUserId(request);
    const profile = await queryOne<{ city: string; geo_place_id: string | null }>(
      'SELECT city, geo_place_id FROM profiles WHERE user_id = $1', [userId],
    );
    if (!profile) throw notFound('Профиль не найден');
    const place = profile.geo_place_id
      ? await queryOne<PlaceRow>(`${SELECT_PLACE} WHERE g.id = $1`, [profile.geo_place_id])
      : null;
    // A legacy profile update can change city without changing geo_place_id.
    const confirmed = place && cityKey(place.city) === cityKey(profile.city);
    return {
      status: confirmed ? 'resolved' : 'needs_city',
      profileCity: profile.city,
      place: confirmed ? place : null,
      message: confirmed ? null : 'Уточните ваш город, чтобы видеть объявления и сообщества рядом.',
      suggestion: cityKey(profile.city) === 'новосибиоск' ? 'Новосибирск' : null,
    };
  });

  app.put('/me', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async request => {
    const userId = currentUserId(request);
    const { placeId } = z.object({ placeId: z.string().min(1).max(200) }).parse(request.body);
    const place = await queryOne<PlaceRow>(`${SELECT_PLACE} WHERE g.id = $1`, [placeId]);
    if (!place) throw notFound('Выберите населённый пункт из справочника');
    // Seeding failure must not prevent a user from saving a valid city.
    const updated = await queryOne<{ user_id: string }>(
      'UPDATE profiles SET city = $2, geo_place_id = $3, updated_at = now() WHERE user_id = $1 RETURNING user_id',
      [userId, place.city, place.id],
    );
    if (!updated) throw notFound('Профиль не найден');
    let demoReady = false;
    try {
      await ensureRegionalCommunities(place);
      demoReady = true;
    } catch (error) {
      request.log.error({ err: error }, 'Regional demo generation failed');
    }
    return { status: 'resolved', place, demoReady };
  });
}
