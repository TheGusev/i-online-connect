export interface SearchableConversation {
  participant: { name: string };
}

export function normalizeChatSearch(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').trim().replace(/\s+/g, ' ');
}

export function searchConversations<T extends SearchableConversation>(items: readonly T[], query: string): T[] {
  const words = normalizeChatSearch(query).split(' ').filter(Boolean);
  return items.filter(item => {
    const name = normalizeChatSearch(item.participant.name);
    return words.every(word => name.includes(word));
  });
}
