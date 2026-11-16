import { inflateRawSync } from 'node:zlib';
import { queryOne, transaction } from '../db.ts';
import { cityKey } from './regional-policy.ts';

const SOURCE = 'https://download.geonames.org/export/dump/RU.zip';
const MAX_ZIP = 64 * 1024 * 1024;
const MAX_TEXT = 256 * 1024 * 1024;

function extractCountry(zip: Buffer): string {
  let end = zip.length - 22;
  for (; end >= Math.max(0, zip.length - 65557); end--) {
    if (zip.readUInt32LE(end) === 0x06054b50) break;
  }
  if (end < 0 || end < zip.length - 65557) throw new Error('Invalid GeoNames ZIP');
  let offset = zip.readUInt32LE(end + 16);
  const entries = zip.readUInt16LE(end + 10);
  for (let i = 0; i < entries; i++) {
    if (zip.readUInt32LE(offset) !== 0x02014b50) throw new Error('Invalid ZIP directory');
    const nameSize = zip.readUInt16LE(offset + 28);
    const extraSize = zip.readUInt16LE(offset + 30);
    const commentSize = zip.readUInt16LE(offset + 32);
    const name = zip.subarray(offset + 46, offset + 46 + nameSize).toString('utf8');
    if (name === 'RU.txt') {
      const method = zip.readUInt16LE(offset + 10);
      const size = zip.readUInt32LE(offset + 20);
      const rawSize = zip.readUInt32LE(offset + 24);
      const local = zip.readUInt32LE(offset + 42);
      if (rawSize > MAX_TEXT || size > MAX_ZIP || zip.readUInt32LE(local) !== 0x04034b50) throw new Error('Invalid ZIP member');
      const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
      if (start + size > zip.length) throw new Error('Truncated ZIP member');
      const packed = zip.subarray(start, start + size);
      const raw = method === 0 ? packed : method === 8 ? inflateRawSync(packed, { maxOutputLength: MAX_TEXT }) : null;
      if (!raw || raw.length !== rawSize) throw new Error('Unsupported or corrupt ZIP member');
      return raw.toString('utf8');
    }
    offset += 46 + nameSize + extraSize + commentSize;
  }
  throw new Error('RU.txt missing');
}

type Settlement = { id: string; city: string; key: string; admin: string; code: string };
function settlements(text: string): Settlement[] {
  const result: Settlement[] = [];
  const cyrillic = /^[А-Яа-яЁё][А-Яа-яЁё0-9 .()–—-]*$/u;
  for (const line of text.split('\n')) {
    const c = line.split('\t');
    if (c.length < 19 || c[8] !== 'RU' || c[6] !== 'P' || !/^(PPL|PPLA[234]?|PPLC)$/.test(c[7] ?? '') || !c[10] || c[10] === '00') continue;
    const city = [c[1] ?? '', ...(c[3] ?? '').split(',')].find(name => cyrillic.test(name));
    if (!city || !/^\d+$/.test(c[0] ?? '')) continue;
    result.push({ id: `geonames:${c[0]}`, city, key: cityKey(city), admin: c[10]!, code: c[7]! });
  }
  return result;
}

export async function syncGeoDirectory(): Promise<void> {
  const fresh = await queryOne<{ fresh: boolean }>(
    `SELECT synced_at > now() - interval '7 days' AS fresh FROM geo_directory_sync WHERE source = $1`, [SOURCE],
  );
  if (fresh?.fresh) return;
  const response = await fetch(SOURCE, { signal: AbortSignal.timeout(60000) });
  if (!response.ok || !response.body) throw new Error(`GeoNames HTTP ${response.status}`);
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > MAX_ZIP) throw new Error('GeoNames download exceeds limit');
    chunks.push(Buffer.from(chunk));
  }
  const places = settlements(extractCountry(Buffer.concat(chunks)));
  if (places.length < 1000) throw new Error('Incomplete GeoNames directory');
  const admins = new Map<string, Settlement[]>();
  for (const place of places) {
    if (place.code !== 'PPLA' && place.code !== 'PPLC') continue;
    const list = admins.get(place.admin) ?? [];
    list.push(place);
    admins.set(place.admin, list);
  }
  await transaction(async client => {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('geo-directory-import', 0))");
    const check = await client.query<{ fresh: boolean }>(
      `SELECT synced_at > now() - interval '7 days' AS fresh FROM geo_directory_sync WHERE source = $1`, [SOURCE],
    );
    if (check.rows[0]?.fresh) return;
    const known = await client.query<{ id: string; center_city: string }>('SELECT id, center_city FROM demo_regions');
    const centers = new Map<string, string[]>();
    for (const row of known.rows) {
      const key = cityKey(row.center_city);
      centers.set(key, [...(centers.get(key) ?? []), row.id]);
    }
    const regions = new Map<string, string>();
    for (const [admin, capitals] of admins) {
      if (capitals.length !== 1) continue;
      const capital = capitals[0]!;
      const existing = centers.get(capital.key) ?? [];
      if (existing.length > 1) continue;
      const id = existing[0] ?? `geonames:RU.${admin}`;
      await client.query('INSERT INTO demo_regions(id, center_city) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, capital.city]);
      regions.set(admin, id);
    }
    const grouped = new Map<string, Settlement[]>();
    for (const place of places) {
      if (!regions.has(place.admin)) continue;
      const key = `${place.admin}:${place.key}`;
      grouped.set(key, [...(grouped.get(key) ?? []), place]);
    }
    const records = [];
    for (const group of grouped.values()) {
      // The current schema cannot disambiguate same-name places inside one region.
      // Omit them rather than attach a user to a guessed settlement.
      if (group.length !== 1) continue;
      const place = group[0]!;
      records.push({ id: place.id, city: place.city, normalized_name: place.key, region_id: regions.get(place.admin)! });
    }
    await client.query(
      `INSERT INTO geo_places(id, city, normalized_name, region_id, source)
       SELECT x.id, x.city, x.normalized_name, x.region_id, $2
         FROM jsonb_to_recordset($1::jsonb) AS x(id text, city text, normalized_name text, region_id text)
       ON CONFLICT DO NOTHING`, [JSON.stringify(records), SOURCE],
    );
    await client.query(
      'INSERT INTO geo_directory_sync(source) VALUES ($1) ON CONFLICT (source) DO UPDATE SET synced_at = now()', [SOURCE],
    );
  });
}
