import { query, transaction } from '../db.ts';
import { cityKey, resolveCity, regionalCommunityTemplates, type CityResolution, type VerifiedPlace } from './regional-policy.ts';

export async function resolveStoredCity(input: string): Promise<CityResolution> {
  const places = await query<{ city: string; regionId: string; regionalCenter: string }>(
    `SELECT p.city, p.region_id AS "regionId", r.center_city AS "regionalCenter"
       FROM geo_places p JOIN demo_regions r ON r.id = p.region_id
      WHERE p.normalized_name = $1`, [cityKey(input)],
  );
  return resolveCity(input, places);
}

// Call only after resolving a place through a trusted directory or a confirmed stored ID.
// Provider/network lookup belongs outside this short transaction.
export async function ensureRegionalCommunities(place: VerifiedPlace): Promise<{ created: number }> {
  return transaction(async client => {
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`regional-demo:${place.regionId}`]);
    const region = await client.query<{ center_city: string }>('SELECT center_city FROM demo_regions WHERE id = $1', [place.regionId]);
    if (region.rows[0]?.center_city !== place.regionalCenter) throw new Error('Verified region is not registered');

    // Never make a real user the apparent author of demo content.
    const hosts = await client.query<{ user_id: string }>(
      `SELECT p.user_id FROM profiles p JOIN users u ON u.id = p.user_id
        WHERE p.is_seed = true AND u.deleted_at IS NULL
          AND u.email LIKE '%@seed.local'
        ORDER BY p.user_id LIMIT 14`,
    );
    if (hosts.rows.length === 0) throw new Error('Demo authors missing: run the existing seed first');

    let created = 0;
    for (const [index, template] of regionalCommunityTemplates(place).entries()) {
      const host = hosts.rows[index % hosts.rows.length]!.user_id;
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO spaces
           (title, description, topic, cover_url, category, format, cadence, city,
            verified_community, join_policy, host_id, is_seed, is_private, region_id, seed_key)
         VALUES ($1, $2, '', '', $3::space_category, 'offline', 'occasional', $4,
                 false, 'open', $5, true, false, $6, $7)
         ON CONFLICT (seed_key) WHERE seed_key IS NOT NULL DO NOTHING RETURNING id`,
        [template.title, template.description, template.category, template.city, host, template.regionId, template.seedKey],
      );
      const id = inserted.rows[0]?.id;
      if (!id) continue;
      await client.query(
        `INSERT INTO space_members (space_id, user_id, status) VALUES ($1, $2, 'host')
         ON CONFLICT DO NOTHING`, [id, host],
      );
      created += 1;
    }
    return { created };
  });
}
