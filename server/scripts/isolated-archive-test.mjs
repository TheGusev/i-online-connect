import assert from 'node:assert/strict';
import { realpath } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
export async function assertArchiveTestDatabase() {
  assert.equal(process.env.NODE_ENV,'test','Requires NODE_ENV=test');
  const u=new URL(process.env.DATABASE_URL||'postgresql://invalid/');
  const ci=process.env.GITHUB_ACTIONS==='true';
  assert.equal(u.hostname,'127.0.0.1','Requires approved test host');
  assert.equal(u.port,ci?'5432':'55439','Requires approved test port');
  assert.equal(u.username,ci?'audit':'cursor_audit','Requires approved test role');
  assert.match(u.pathname,ci?/^\/server_unit_[0-9]+$/:/^\/space_api_diag_[0-9a-f]{8}$/,'Requires approved test database');
  const base=await realpath(ci?process.env.RUNNER_TEMP:process.env.CURSOR_TEST_ROOT);
  if(ci) assert.equal(u.searchParams.get('host'),null);
  else { assert.ok(base.startsWith('/tmp/ya-cursor-it.')); assert.equal(u.searchParams.get('host'),path.join(base,'socket')); }
  for(const dir of [process.env.MEDIA_DIR,os.tmpdir()]) assert.ok((await realpath(dir)).startsWith(base+path.sep),'Requires isolated file directories');
  const {default:pg}=await import('pg');
  const c=new pg.Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000});
  try {
    await c.connect();
    const r=(await c.query('SELECT current_database() AS db,current_user AS role,inet_server_addr() AS addr')).rows[0];
    assert.equal(r.db,u.pathname.slice(1)); assert.equal(r.role,ci?'audit':'cursor_audit');
    if(!ci) { assert.equal(r.addr,null); const d=(await c.query('SHOW data_directory')).rows[0].data_directory; assert.equal(await realpath(d),path.join(base,'pgdata')); }
  } finally { await c.end(); }
}
