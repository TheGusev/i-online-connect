import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCity, selectRegionalCommunities, regionalCommunityTemplates, ensureRegionalDemo } from '../src/seed/regional-policy.ts';

const directory = [
  { city: 'Новосибирск', regionId: 'test-nso', regionalCenter: 'Новосибирск' },
  { city: 'Колывань', regionId: 'test-nso', regionalCenter: 'Новосибирск' },
];

test('same region shares templates without changing profile city', () => {
  const result = resolveCity(' Колывань ', directory);
  assert.equal(result.status, 'resolved');
  assert.equal(result.place.city, 'Колывань');
  assert.equal(result.place.regionalCenter, 'Новосибирск');
  const a = regionalCommunityTemplates(directory[0]);
  const b = regionalCommunityTemplates(directory[1]);
  assert.deepEqual(a, b);
  assert.equal(new Set(a.map(x => x.seedKey)).size, 14);
  assert.ok(a.every(x => x.isSeed && !x.verifiedCommunity));
});

test('unknown, empty and ambiguous cities require clarification', () => {
  assert.equal(resolveCity('Мир', directory).status, 'needs_city');
  assert.equal(resolveCity('', directory).status, 'needs_city');
  assert.equal(resolveCity('Колывань', [...directory, { ...directory[1], regionId: 'other' }]).status, 'needs_city');
  assert.deepEqual(resolveCity('Новосибиоск', directory, { новосибиоск: 'Новосибирск' }), {
    status: 'needs_confirmation', suggestion: 'Новосибирск',
  });
});

const row = (id, options = {}) => ({ id, regionId: 'test-nso', isSeed: true, isPrivate: false, accessible: true, joined: false, ...options });
test('one public regional community replaces one demo; private and other regions do not', () => {
  const seeds = [row('a'), row('b'), row('c')];
  const real = row('real', { isSeed: false });
  const hidden = row('private', { isSeed: false, isPrivate: true });
  const foreign = row('foreign', { isSeed: false, regionId: 'other' });
  assert.deepEqual(selectRegionalCommunities([...seeds, hidden, foreign], 'test-nso').map(x => x.id), ['a', 'b', 'c']);
  assert.equal(selectRegionalCommunities([...seeds, real, hidden, foreign], 'test-nso').filter(x => x.isSeed).length, 2);
  assert.equal(seeds.length, 3);
});

test('memberships stay accessible without leaking inaccessible communities', () => {
  const rows = [row('member', { isPrivate: true, joined: true, regionId: 'other' }), row('secret', { accessible: false, joined: true })];
  assert.deepEqual(selectRegionalCommunities(rows, 'test-nso').map(x => x.id), ['member']);
});

test('only resolved geography may trigger automatic seeding', async () => {
  const calls = [];
  const persist = async (region, templates) => { calls.push([region, templates.length]); };
  assert.equal(await ensureRegionalDemo(resolveCity('Мир', directory), persist), false);
  assert.equal(await ensureRegionalDemo(resolveCity('Колывань', directory), persist), true);
  assert.deepEqual(calls, [['test-nso', 14]]);
});
