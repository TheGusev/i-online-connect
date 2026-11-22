import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fieldCapacity, splitBoard } from './split';
import type { BoardPost } from './types';

const NOW = Date.parse('2026-11-19T12:00:00Z');
const HOUR = 3_600_000;

const post = (id: string, hoursAgo: number, extra: Partial<BoardPost> = {}): BoardPost => ({
  id,
  kind: 'note',
  authorId: 'u1',
  authorName: 'Анна',
  text: id,
  status: 'open',
  pinned: false,
  createdAt: new Date(NOW - hoursAgo * HOUR).toISOString(),
  clientTempId: `t-${id}`,
  ...extra,
});

const ids = (list: BoardPost[]) => list.map((item) => item.id);

test('свежие карточки остаются на поле', () => {
  const { field, shelf } = splitBoard([post('a', 1), post('b', 2)], NOW, 4);
  assert.deepEqual(ids(field), ['a', 'b']);
  assert.deepEqual(ids(shelf), []);
});

test('карточки старше суток уходят на полку', () => {
  const { field, shelf } = splitBoard([post('new', 1), post('old', 25)], NOW, 4);
  assert.deepEqual(ids(field), ['new']);
  assert.deepEqual(ids(shelf), ['old']);
});

test('при переполнении старые уходят раньше суток, новые остаются', () => {
  const list = [1, 2, 3, 4, 5, 6].map((h) => post(`p${h}`, h));
  const { field, shelf } = splitBoard(list, NOW, 4);
  assert.deepEqual(ids(field), ['p1', 'p2', 'p3', 'p4']);
  assert.deepEqual(ids(shelf), ['p5', 'p6']);
});

test('закреплённые остаются на поле и занимают места', () => {
  const list = [post('pin', 30, { pinned: true }), ...[1, 2, 3, 4, 5].map((h) => post(`f${h}`, h))];
  const { field, shelf } = splitBoard(list, NOW, 4);
  assert.deepEqual(ids(field), ['pin', 'f1', 'f2', 'f3']);
  assert.deepEqual(ids(shelf), ['f4', 'f5']);
});

test('на поле не больше двух закреплённых', () => {
  const list = [1, 2, 3].map((h) => post(`k${h}`, h, { pinned: true }));
  const { field, shelf } = splitBoard(list, NOW, 4);
  assert.deepEqual(ids(field), ['k1', 'k2']);
  assert.deepEqual(ids(shelf), ['k3']);
});

test('вместимость поля зависит от высоты и ограничена', () => {
  assert.equal(fieldCapacity(0), 4);
  assert.equal(fieldCapacity(Number.NaN), 4);
  assert.equal(fieldCapacity(200), 4);
  assert.equal(fieldCapacity(400), 8);
  assert.equal(fieldCapacity(900), 8);
  assert.equal(fieldCapacity(50), 2);
});
