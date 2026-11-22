function matchesMessage(item, message, replaceId) {
  return item.id === message.id || Boolean(replaceId && item.id === replaceId) ||
    Boolean(message.clientTempId && item.clientTempId === message.clientTempId &&
      item.authorId === message.authorId && item.conversationId === message.conversationId);
}

export function upsertMessagePages(pages, message, replaceId) {
  let targetPage = -1;
  let targetIndex = -1;
  for (let p = 0; p < pages.length; p += 1) {
    const i = pages[p].items.findIndex(item => matchesMessage(item, message, replaceId));
    if (i !== -1) { targetPage = p; targetIndex = i; break; }
  }
  if (targetPage === -1) {
    return pages.map((page, p) => p === 0 ? { ...page, items: [...page.items, message] } : page);
  }
  return pages.map((page, p) => {
    if (!page.items.some(item => matchesMessage(item, message, replaceId))) return page;
    return { ...page, items: page.items.flatMap((item, i) => {
      if (!matchesMessage(item, message, replaceId)) return [item];
      return p === targetPage && i === targetIndex ? [{ ...item, ...message }] : [];
    }) };
  });
}

export function captureMessagePosition(pages, id) {
  for (let p = 0; p < pages.length; p += 1) {
    const index = pages[p].items.findIndex(item => item.id === id);
    if (index !== -1) return {
      pageIndex: p, index,
      beforeId: pages[p].items[index - 1]?.id ?? null,
      afterId: pages[p].items[index + 1]?.id ?? null,
    };
  }
  return null;
}

export function removeMessagePages(pages, id) {
  return pages.map(page => page.items.some(item => item.id === id)
    ? { ...page, items: page.items.filter(item => item.id !== id) } : page);
}

export function restoreMessagePages(pages, message, position) {
  if (!position || pages.length === 0 || pages.some(page => page.items.some(item => item.id === message.id))) return pages;
  let pageIndex = -1;
  let index = -1;
  if (position.afterId) {
    for (let p = 0; p < pages.length; p += 1) {
      const i = pages[p].items.findIndex(item => item.id === position.afterId);
      if (i !== -1) { pageIndex = p; index = i; break; }
    }
  }
  if (pageIndex === -1 && position.beforeId) {
    for (let p = 0; p < pages.length; p += 1) {
      const i = pages[p].items.findIndex(item => item.id === position.beforeId);
      if (i !== -1) { pageIndex = p; index = i + 1; break; }
    }
  }
  if (pageIndex === -1) {
    pageIndex = Math.min(position.pageIndex, pages.length - 1);
    index = Math.min(position.index, pages[pageIndex].items.length);
  }
  return pages.map((page, p) => p === pageIndex
    ? { ...page, items: [...page.items.slice(0, index), message, ...page.items.slice(index)] } : page);
}
