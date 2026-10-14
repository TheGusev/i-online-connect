export const CUTOFF = '2026-10-14T20:03:00Z';

export async function inspect(client) {
  const { rows } = await client.query(`
    SELECT count(*)::int AS users,
      count(*) FILTER (WHERE u.deleted_at IS NOT NULL)::int AS deleted,
      count(*) FILTER (WHERE p.user_id IS NULL)::int AS without_profile,
      count(*) FILTER (WHERE p.trust_level IN ('new','verified'))::int AS to_update,
      count(*) FILTER (WHERE p.trust_level = 'trusted')::int AS trusted,
      count(*) FILTER (WHERE p.trust_level = 'ambassador')::int AS ambassador
    FROM users u LEFT JOIN profiles p ON p.user_id = u.id
    WHERE u.created_at <= $1::timestamptz`, [CUTOFF]);
  return rows[0];
}

// The caller persists the backup before any mutation. No identity-check fields are changed.
export async function apply(client, saveBackup) {
  await client.query('BEGIN');
  try {
    const { rows } = await client.query(`
      SELECT p.user_id, p.trust_level, p.updated_at::text AS updated_at
      FROM profiles p JOIN users u ON u.id = p.user_id
      WHERE u.created_at <= $1::timestamptz AND p.trust_level IN ('new','verified')
      ORDER BY p.user_id FOR UPDATE OF p`, [CUTOFF]);
    const { rows: [clock] } = await client.query('SELECT now()::text AS applied_at');
    await saveBackup({ version: 1, cutoff: CUTOFF, appliedAt: clock.applied_at, profiles: rows });
    const result = await client.query(`UPDATE profiles SET trust_level = 'trusted', updated_at = now()
      WHERE user_id = ANY($1::uuid[]) RETURNING user_id`, [rows.map(row => row.user_id)]);
    if (result.rowCount !== rows.length) throw new Error('Количество обновлений не совпало');
    await client.query('COMMIT');
    return result.rowCount;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

export async function restore(client, backup) {
  if (backup.version !== 1 || backup.cutoff !== CUTOFF || !Array.isArray(backup.profiles)
    || !Number.isFinite(Date.parse(backup.appliedAt))) throw new Error('Некорректная резервная копия');
  await client.query('BEGIN');
  try {
    let restored = 0;
    for (const row of backup.profiles) {
      if (!['new', 'verified'].includes(row.trust_level)) throw new Error('Некорректный прежний уровень');
      const result = await client.query(`UPDATE profiles
        SET trust_level = $2::trust_level, updated_at = $3::timestamptz
        WHERE user_id = $1 AND trust_level = 'trusted' AND updated_at = $4::timestamptz`,
      [row.user_id, row.trust_level, row.updated_at, backup.appliedAt]);
      if (result.rowCount !== 1) throw new Error('Профиль изменён после назначения — автоматический откат остановлен');
      restored += result.rowCount;
    }
    await client.query('COMMIT');
    return restored;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}