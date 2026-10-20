/**
 * Стабильная рассадка по лузам: кто уже сидит — остаётся на месте,
 * вышедшие освобождают лузу, новые занимают первую свободную.
 * Кому не хватило места — в результат не попадает («в зале»).
 */
export function assignSeats(prev: Record<string, number>, userIds: string[], seatCount: number): Record<string, number> {
  const present = new Set(userIds);
  const next: Record<string, number> = {};
  const taken = new Set<number>();
  for (const [id, seat] of Object.entries(prev)) {
    if (present.has(id) && seat >= 0 && seat < seatCount && !taken.has(seat)) {
      next[id] = seat;
      taken.add(seat);
    }
  }
  for (const id of userIds) {
    if (id in next) continue;
    let seat = 0;
    while (seat < seatCount && taken.has(seat)) seat += 1;
    if (seat >= seatCount) break;
    next[id] = seat;
    taken.add(seat);
  }
  return next;
}
