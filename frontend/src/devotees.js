export const MAX_DEVOTEES = 20;

export function seatDevotee(prev, person, max = MAX_DEVOTEES) {
  const found = prev.findIndex((item) => item.userKey === person.userKey);
  if (found >= 0) {
    const next = [...prev];
    next[found] = {
      ...next[found],
      username: person.username,
      avatar: person.avatar || next[found].avatar,
      comment: person.comment || next[found].comment || "",
    };
    return next;
  }
  if (prev.length >= max) {
    const seat = prev[0].seat;
    return [...prev.slice(1), { ...person, seat }];
  }
  const used = new Set(prev.map((item) => item.seat));
  let seat = 0;
  while (used.has(seat)) seat += 1;
  return [...prev, { ...person, seat }];
}

export function releaseDevotee(prev, userKey) {
  if (!userKey) return prev;
  return prev.filter((item) => item.userKey !== userKey);
}
