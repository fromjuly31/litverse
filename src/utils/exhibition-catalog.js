const normalized = (value) =>
  String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, " ")
    .toLowerCase();
const workKey = ({ title, author }) =>
  JSON.stringify([normalized(title), normalized(author)]);
const dateOrder = (date) => (a, b) =>
  (Date.parse(b[date]) || 0) - (Date.parse(a[date]) || 0) ||
  a.id.localeCompare(b.id);

export const WORKS_PER_PAGE = 24;

export function groupExhibits(posters, perspectives) {
  const byWork = new Map();
  for (const [kind, entries] of [
    ["posters", posters],
    ["perspectives", perspectives],
  ]) {
    for (const entry of entries) {
      const key = workKey(entry);
      if (!byWork.has(key))
        byWork.set(key, { key, posters: [], perspectives: [] });
      byWork.get(key)[kind].push(entry);
    }
  }
  const works = [...byWork.values()];
  for (const work of works) {
    work.posters.sort(dateOrder("finalized_at"));
    work.perspectives.sort(dateOrder("published_at"));
    const representative = work.posters[0] || work.perspectives[0];
    work.title = representative.title;
    work.author = representative.author;
    work.latest = Math.max(
      Date.parse(work.posters[0]?.finalized_at) || 0,
      Date.parse(work.perspectives[0]?.published_at) || 0,
    );
  }
  return works.sort(
    (a, b) => b.latest - a.latest || a.key.localeCompare(b.key),
  );
}

export function matchWorks(works, query) {
  const term = normalized(query);
  if (!term) return works;
  return works.filter(
    (work) =>
      normalized(`${work.title} ${work.author}`).includes(term) ||
      work.posters.some((poster) =>
        normalized(poster.signature).includes(term),
      ),
  );
}

export function findWork(works, { work_key, poster_id, session_id }) {
  if (work_key) return works.find((work) => work.key === work_key);
  return works.find(({ posters, perspectives }) =>
    poster_id
      ? posters.some(({ id }) => id === poster_id)
      : perspectives.some(({ id }) => id === session_id),
  );
}

export function workSummary({ key, title, author }, poster = null) {
  return { key, title, author, poster };
}

export function alternatePosters(work) {
  return work.posters.map(({ id, signature, finalized_at }) => ({
    id,
    signature,
    finalized_at,
  }));
}
