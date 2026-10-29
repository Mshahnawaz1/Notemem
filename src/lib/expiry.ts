// A room is deleted after 30 days without a committed write. Reads never extend it, and
// writes extend it at most once a day, so a busy room doesn't rewrite its alarm on every write.

export const INACTIVITY_MS = 30 * 24 * 60 * 60 * 1000;
export const EXTEND_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** When the room is deleted, in ms since the epoch, or null if the room has no `room` row. */
export function readExpiresAt(sql: SqlStorage): number | null {
  return sql.exec<{ expires_at: number }>(`SELECT expires_at FROM room WHERE id = 1`).toArray()[0]?.expires_at ?? null;
}

/**
 * Moves the expiry to 30 days from `now`, unless it was already moved in the last day.
 * Returns the new expiry, or null if it was left alone.
 */
export function extendExpiry(sql: SqlStorage, now: number): number | null {
  const current = readExpiresAt(sql);
  if (current === null || current - now > INACTIVITY_MS - EXTEND_INTERVAL_MS) return null;
  const next = now + INACTIVITY_MS;
  sql.exec(`UPDATE room SET expires_at = ? WHERE id = 1`, next);
  return next;
}
