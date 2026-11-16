import { query } from '../db.ts';
import { ensureRegionalCommunities } from './regional-store.ts';
import type { VerifiedPlace } from './regional-policy.ts';

type Log = { info: (message: string) => void; error: (message: string) => void };
let running = false;

export async function runRegionalDemo(log: Log): Promise<void> {
  if (running) return;
  running = true;
  try {
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
