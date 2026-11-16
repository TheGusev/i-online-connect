import test from 'node:test';
import assert from 'node:assert/strict';
import { searchConversations, normalizeChatSearch } from '../../src/features/chat/chat-search.ts';

const rows = [
  { id: '1', participant: { name: 'Алёна Иванова' } },
  { id: '2', participant: { name: 'Иван Петров' } },
  { id: '3', participant: { name: 'Алексей Смирнов' } },
];

test('empty query preserves order without mutating the input', () => {
  const result = searchConversations(rows, '  ');
  assert.deepEqual(result, rows);
  assert.notEqual(result, rows);
  assert.equal(rows.length, 3);
});
test('Cyrillic search ignores case and ё versus е', () => {
  assert.deepEqual(searchConversations(rows, 'АЛЕНА').map(x => x.id), ['1']);
});
test('all query words match independently of order', () => {
  assert.deepEqual(searchConversations(rows, 'иванова   алёна').map(x => x.id), ['1']);
});
test('partial names match while unmatched names return empty', () => {
  assert.deepEqual(searchConversations(rows, 'петр').map(x => x.id), ['2']);
  assert.deepEqual(searchConversations(rows, 'несуществующий'), []);
});
test('query is treated as text, not a regular expression', () => {
  assert.deepEqual(searchConversations(rows, '.*'), []);
});
test('normalization handles repeated whitespace', () => {
  assert.equal(normalizeChatSearch('  ИВАН\t ПЕТРОВ '), 'иван петров');
});
test('generic objects retain fields and identity', () => {
  const item = { id: 'x', pinned: true, participant: { name: 'Тест' } };
  assert.equal(searchConversations([item], 'тест')[0], item);
});
