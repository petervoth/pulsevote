export function mergeMostRecentPerUser(existing, incoming) {
  const map = new Map();

  function add(p) {
    if (!p?.user_id) return;
    const key = String(p.user_id);
    const ts = p.created_at ? new Date(p.created_at).getTime() : 0;
    const prev = map.get(key);
    if (!prev || ts > new Date(prev.created_at).getTime()) {
      map.set(key, p);
    }
  }

  existing.forEach(add);
  incoming.forEach(add);

  return Array.from(map.values());
}
