import { randomUUID } from 'node:crypto';
import { toCsv } from './advancedReports.js';

// Bounded, short-lived snapshots. An eviction/restart must never trigger a fresh query.
export const createReportSnapshotStore = ({ now = Date.now, ttl = 15 * 60 * 1000, maxBytes = 32 * 1024 * 1024, maxEntries = 200, perOwner = 10 } = {}) => {
  const entries = new Map();
  let bytes = 0;
  const remove = id => { bytes -= entries.get(id).bytes; entries.delete(id); };
  const prune = () => { for (const [id, entry] of entries) if (entry.expires <= now()) remove(id); };
  const owner = (company, user) => JSON.stringify([String(company), String(user)]);
  return {
    put(company, user, result) {
      prune();
      const csv = toCsv(result.rows), size = Buffer.byteLength(csv);
      if (size > maxBytes) return null;
      const identity = owner(company, user);
      const owned = [...entries].filter(([, entry]) => entry.owner === identity);
      while (owned.length >= perOwner) remove(owned.shift()[0]);
      while (entries.size && (entries.size >= maxEntries || bytes + size > maxBytes)) remove(entries.keys().next().value);
      const id = randomUUID(), expires = now() + ttl;
      entries.set(id, { owner: identity, csv, bytes: size, expires, generatedAt: result.generated_at, truncated: Boolean(result.truncated) });
      bytes += size;
      return { id, expires_at: new Date(expires).toISOString() };
    },
    get(id, company, user) {
      prune();
      const entry = entries.get(id);
      return entry?.owner === owner(company, user) ? { csv: entry.csv, generatedAt: entry.generatedAt, truncated: entry.truncated } : null;
    },
  };
};
export const reportSnapshots = createReportSnapshotStore();
