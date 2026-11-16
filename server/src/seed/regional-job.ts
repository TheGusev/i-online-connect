import { query } from '../db.ts';
import { ensureRegionalCommunities } from './regional-store.ts';
import { syncGeoDirectory } from './geo-directory.ts';
import type { VerifiedPlace } from './regional-policy.ts';

type Log = { info: (message: string) => void; error: (message: string) => void };
let running = false;

export async function runRegionalDemo(log: Log): Promise<void> {
  if (running) return;
  running = true;
  try {
    try { await syncGeoDirectory(); }
    catch (error) { log.error(`[geo-directory] ${String(error)}`); }
    // Exact, unique matches only. 'Мир' and spelling corrections require selection.
    await query(
      `UPDATE profiles p SET geo_place_id = g.id
         FROM geo_places g
        WHERE p.geo_place_id IS NULL AND p.is_seed = false
          AND lower(trim(p.city)) = g.normalized_name
          AND g.normalized_name <> 'мир'
          AND EXISTS (SELECT 1 FROM users u WHERE u.id = p.user_id AND u.deleted_at IS NULL)
          AND (SELECT count(*) FROM geo_places x WHERE x.normalized_name = g.normalized_name) = 1`,
    );
    const regions = await query<VerifiedPlace>(
      `SELECT DISTINCT r.center_city AS city, r.id AS "regionId", r.center_city AS "regionalCenter"
         FROM profiles p
         JOIN users u ON u.id = p.user_id AND u.deleted_at IS NULL
         JOIN geo_places g ON g.id = p.geo_place_id
         JOIN demo_regions r ON r.id = g.region_id
        WHERE p.is_seed = false AND lower(trim(p.city)) = g.normalized_name`,
    );
    for (const region of regions) {
      try {
        const result = await ensureRegionalCommunities(region);
        if (result.created > 0) log.info(`[regional-demo] ${region.regionalCenter}: created ${result.created}`);
      } catch (error) {
        log.error(`[regional-demo] ${region.regionId}: ${String(error)}`);
      }
    }
  } catch (error) {
    log.error(`[regional-demo] ${String(error)}`);
  } finally {
    running = false;
  }
}
