import type { Source } from "./schemas";

// Pad logic shared by the HTTP and MCP layers. Every write runs in one storage transaction.

export interface PadLimits {
  maxPadBytes: number;
  maxPads: number;
  maxRevisionsPerPad: number;
  maxHistoryBytes: number;
}

export const DEFAULT_LIMITS: PadLimits = {
  maxPadBytes: 256 * 1024,
  maxPads: 20,
  maxRevisionsPerPad: 50,
  maxHistoryBytes: 4 * 1024 * 1024,
};

export interface PadMeta {
  name: string;
  version: number;
  updated_at: string;
}

export interface Pad extends PadMeta {
  content: string;
  created_at: string;
}

export interface Revision {
  version: number;
  created_at: string;
  source: Source;
  content: string;
}

export type WriteError =
  | { error: "not_found" }
  | { error: "conflict"; currentVersion: number }
  | { error: "too_large"; limit: number }
  | { error: "pad_limit"; limit: number };

export type WriteResult = { ok: true; version: number } | ({ ok: false } & WriteError);

type RevisionRow = {
  id: number;
  version: number;
  kind: "full" | "delta";
  content: string;
  bytes: number;
};

export function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

export class PadStore {
  constructor(
    private readonly storage: DurableObjectStorage,
    private readonly limits: PadLimits = DEFAULT_LIMITS
  ) {}

  private get sql(): SqlStorage {
    return this.storage.sql;
  }

  list(): PadMeta[] {
    return this.sql
      .exec<{ name: string; version: number; updated_at: string }>(
        `SELECT name, version, updated_at FROM pads ORDER BY name`
      )
      .toArray();
  }

  read(name: string): Pad | null {
    const row = this.sql
      .exec<{ content: string; version: number; created_at: string; updated_at: string }>(
        `SELECT content, version, created_at, updated_at FROM pads WHERE name = ?`,
        name
      )
      .toArray()[0];
    return row ? { name, ...row } : null;
  }

  /** Creates or replaces a pad. With `expectedVersion`, fails on a version mismatch. */
  replace(name: string, content: string, source: Source, expectedVersion?: number): WriteResult {
    if (byteLength(content) > this.limits.maxPadBytes) {
      return { ok: false, error: "too_large", limit: this.limits.maxPadBytes };
    }
    return this.storage.transactionSync((): WriteResult => {
      const existing = this.currentVersion(name);
      if (existing === null) {
        if (this.padCount() >= this.limits.maxPads) {
          return { ok: false, error: "pad_limit", limit: this.limits.maxPads };
        }
        this.sql.exec(`INSERT INTO pads (name, content, version) VALUES (?, ?, 1)`, name, content);
        this.addRevision(name, 1, "full", content, source);
        return { ok: true, version: 1 };
      }
      if (expectedVersion !== undefined && expectedVersion !== existing) {
        return { ok: false, error: "conflict", currentVersion: existing };
      }
      const version = existing + 1;
      this.sql.exec(
        `UPDATE pads SET content = ?, version = ?, updated_at = CURRENT_TIMESTAMP WHERE name = ?`,
        content,
        version,
        name
      );
      this.addRevision(name, version, "full", content, source);
      return { ok: true, version };
    });
  }

  /** Appends to an existing pad. Never conflicts; the revision stores only the appended text. */
  append(name: string, text: string, source: Source): WriteResult {
    return this.storage.transactionSync((): WriteResult => {
      const pad = this.sql
        .exec<{ content: string; version: number }>(`SELECT content, version FROM pads WHERE name = ?`, name)
        .toArray()[0];
      if (!pad) return { ok: false, error: "not_found" };
      const content = pad.content + text;
      if (byteLength(content) > this.limits.maxPadBytes) {
        return { ok: false, error: "too_large", limit: this.limits.maxPadBytes };
      }
      const version = pad.version + 1;
      this.sql.exec(
        `UPDATE pads SET content = ?, version = ?, updated_at = CURRENT_TIMESTAMP WHERE name = ?`,
        content,
        version,
        name
      );
      // A pad whose history was emptied needs a full snapshot to restore from.
      const hasRevisions = this.sql.exec(`SELECT 1 FROM revisions WHERE pad_name = ? LIMIT 1`, name).toArray().length > 0;
      this.addRevision(name, version, hasRevisions ? "delta" : "full", hasRevisions ? text : content, source);
      return { ok: true, version };
    });
  }

  /** Returns false if the pad did not exist. */
  delete(name: string): boolean {
    return this.storage.transactionSync(() => {
      const existed = this.currentVersion(name) !== null;
      const freed = this.sql
        .exec<{ total: number | null }>(`SELECT SUM(bytes) AS total FROM revisions WHERE pad_name = ?`, name)
        .one().total ?? 0;
      this.sql.exec(`DELETE FROM pads WHERE name = ?`, name);
      this.sql.exec(`DELETE FROM revisions WHERE pad_name = ?`, name);
      this.adjustHistoryBytes(-freed);
      return existed;
    });
  }

  /** Kept revisions, newest first, each with its full content rebuilt from snapshots and deltas. */
  history(name: string): Revision[] {
    const rows = this.sql
      .exec<{ version: number; kind: "full" | "delta"; content: string; source: Source; created_at: string }>(
        `SELECT version, kind, content, source, created_at FROM revisions WHERE pad_name = ? ORDER BY version ASC`,
        name
      )
      .toArray();
    let current = "";
    const revisions = rows.map((row) => {
      current = row.kind === "full" ? row.content : current + row.content;
      return { version: row.version, created_at: row.created_at, source: row.source, content: current };
    });
    return revisions.reverse();
  }

  /** Bytes currently used by stored revisions across the room. */
  historyBytes(): number {
    return this.sql.exec<{ history_bytes: number }>(`SELECT history_bytes FROM room WHERE id = 1`).toArray()[0]
      ?.history_bytes ?? 0;
  }

  private currentVersion(name: string): number | null {
    return this.sql.exec<{ version: number }>(`SELECT version FROM pads WHERE name = ?`, name).toArray()[0]?.version ?? null;
  }

  private padCount(): number {
    return this.sql.exec<{ count: number }>(`SELECT COUNT(*) AS count FROM pads`).one().count;
  }

  private addRevision(name: string, version: number, kind: "full" | "delta", content: string, source: Source): void {
    const bytes = byteLength(content);
    this.sql.exec(
      `INSERT INTO revisions (pad_name, version, kind, content, bytes, source) VALUES (?, ?, ?, ?, ?, ?)`,
      name,
      version,
      kind,
      content,
      bytes,
      source
    );
    this.adjustHistoryBytes(bytes);
    this.trim(name);
  }

  /**
   * Enforces the per-pad revision cap, then the room-wide history budget, dropping the
   * oldest revisions first. A pad's latest revision is never dropped.
   */
  private trim(name: string): void {
    let count = this.sql.exec<{ count: number }>(`SELECT COUNT(*) AS count FROM revisions WHERE pad_name = ?`, name).one().count;
    while (count > this.limits.maxRevisionsPerPad && this.dropOldestRevision(name)) count--;

    // A delta chain takes as many bytes as the content at its newest revision, so dropping
    // part of one frees nothing. Only a whole segment (a snapshot plus its deltas, up to the
    // next snapshot) frees bytes. The newest segment of each pad is always kept; once the
    // per-room content cap is enforced, that is always under the history budget.
    while (this.historyBytes() > this.limits.maxHistoryBytes) {
      const oldest = this.sql
        .exec<{ pad_name: string }>(
          `SELECT pad_name, MIN(id) AS first_id FROM revisions
           GROUP BY pad_name HAVING SUM(kind = 'full') > 1
           ORDER BY first_id ASC LIMIT 1`
        )
        .toArray()[0];
      if (!oldest) break;
      this.dropOldestSegment(oldest.pad_name);
    }
  }

  /** Deletes a pad's oldest snapshot and the deltas that follow it, up to its next snapshot. */
  private dropOldestSegment(name: string): void {
    const nextSnapshot = this.sql
      .exec<{ version: number }>(
        `SELECT version FROM revisions WHERE pad_name = ? AND kind = 'full' ORDER BY version ASC LIMIT 1 OFFSET 1`,
        name
      )
      .one().version;
    const freed = this.sql
      .exec<{ total: number }>(
        `SELECT SUM(bytes) AS total FROM revisions WHERE pad_name = ? AND version < ?`,
        name,
        nextSnapshot
      )
      .one().total;
    this.sql.exec(`DELETE FROM revisions WHERE pad_name = ? AND version < ?`, name, nextSnapshot);
    this.adjustHistoryBytes(-freed);
  }

  /**
   * Deletes a pad's oldest revision. If the next one is a delta, it is rewritten as a full
   * snapshot first, so the oldest kept revision can always be restored on its own.
   */
  private dropOldestRevision(name: string): boolean {
    const [oldest, next] = this.sql
      .exec<RevisionRow>(
        `SELECT id, version, kind, content, bytes FROM revisions WHERE pad_name = ? ORDER BY version ASC LIMIT 2`,
        name
      )
      .toArray();
    if (!oldest || !next) return false;
    let delta = -oldest.bytes;
    if (next.kind === "delta") {
      const snapshot = oldest.content + next.content;
      const bytes = byteLength(snapshot);
      this.sql.exec(`UPDATE revisions SET kind = 'full', content = ?, bytes = ? WHERE id = ?`, snapshot, bytes, next.id);
      delta += bytes - next.bytes;
    }
    this.sql.exec(`DELETE FROM revisions WHERE id = ?`, oldest.id);
    this.adjustHistoryBytes(delta);
    return true;
  }

  private adjustHistoryBytes(delta: number): void {
    if (delta) this.sql.exec(`UPDATE room SET history_bytes = history_bytes + ? WHERE id = 1`, delta);
  }
}
