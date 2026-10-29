export type Role = "read" | "write";

/** 128 bits of randomness as 32 hex characters. */
export function generateSecret(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(16)));
}

/** Short routing ID; not a secret. */
export function generateRoomId(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(6)));
}

export async function hashSecret(secret: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return toHex(new Uint8Array(digest));
}

/** Returns false if the room already has keys. */
export function storeKeyHashes(sql: SqlStorage, readHash: string, writeHash: string): boolean {
  const existing = sql.exec(`SELECT 1 FROM room WHERE id = 1`).toArray();
  if (existing.length) return false;
  sql.exec(`INSERT INTO room (id, read_hash, write_hash) VALUES (1, ?, ?)`, readHash, writeHash);
  return true;
}

/** Which role a raw secret grants in this room, or null if it matches neither hash. */
export async function resolveRole(sql: SqlStorage, secret: string): Promise<Role | null> {
  const room = sql
    .exec<{ read_hash: string; write_hash: string }>(`SELECT read_hash, write_hash FROM room WHERE id = 1`)
    .toArray()[0];
  if (!room) return null;
  const hash = await hashSecret(secret);
  if (hash === room.write_hash) return "write";
  if (hash === room.read_hash) return "read";
  return null;
}

/** Hides anything shaped like a secret (32+ hex characters) before text goes into a log or error. */
export function redactSecrets(text: string): string {
  return text.replace(/[0-9a-f]{32,}/gi, "<redacted>");
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
